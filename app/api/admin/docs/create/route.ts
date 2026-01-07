/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/create/route.ts
 * Módulo: Docs
 * Etapa: Create (v1.1 - status)
 * Descrição:
 *  - Cria doc em "pending"
 *  - Gera signed upload URL
 *  - Se signing falhar, marca doc como "failed" + error
 * =============================================
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "../../../../../lib/supabase/server"

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getEmpresaId(req: Request): string | null {
  return req.headers.get("x-empresa-id") || req.headers.get("X-Empresa-Id")
}

async function assertAdmin(userId: string, empresaId: string) {
  const admin = supabaseAdmin()

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, role, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle()

  if (profErr) return { ok: false as const, status: 500, error: "PROFILE_LOOKUP_FAILED" as const, details: profErr.message }
  if (!profile || profile.ativo === false) return { ok: false as const, status: 403, error: "NO_PROFILE" as const }
  if (profile.role !== "admin") return { ok: false as const, status: 403, error: "NOT_ADMIN" as const }

  return { ok: true as const, profileId: profile.id as string }
}

function safeName(name: string) {
  // Mantém legível, mas remove barras e caracteres de path que quebram storage
  return String(name || "file")
    .replace(/[\/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(req: Request) {
  try {
    const empresaId = getEmpresaId(req)
    if (!empresaId) return NextResponse.json({ ok: false, error: "MISSING_EMPRESA_ID" }, { status: 400 })

    const supabase = createSupabaseServerClient()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    const user = userRes?.user
    if (userErr || !user) return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 401 })

    const adminCheck = await assertAdmin(user.id, empresaId)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, error: adminCheck.error, details: (adminCheck as any).details ?? null },
        { status: adminCheck.status }
      )
    }

    const body = await req.json().catch(() => null)
    const filename = safeName(body?.filename ?? "")
    const mime_type = body?.mime_type ? String(body.mime_type) : null
    const size_bytes = Number.isFinite(body?.size_bytes) ? Number(body.size_bytes) : null

    if (!filename) {
      return NextResponse.json({ ok: false, error: "MISSING_FILENAME" }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // 1) Cria doc em pending
    const { data: created, error: cErr } = await admin
      .from("docs")
      .insert({
        empresa_id: empresaId,
        storage_bucket: "moduz-docs",
        // storage_path depende do id, então preenchemos após inserir
        storage_path: "tmp",
        filename,
        mime_type,
        size_bytes,
        created_by: user.id,
        status: "pending",
        error: null,
        uploaded_at: null,
      })
      .select("id, empresa_id, storage_bucket, created_at")
      .single()

    if (cErr || !created?.id) {
      return NextResponse.json({ ok: false, error: "DOC_CREATE_FAILED", details: cErr?.message ?? null }, { status: 500 })
    }

    const docId = created.id as string
    const storage_bucket = created.storage_bucket as string
    const storage_path = `empresa/${empresaId}/${docId}/${filename}`

    // 2) Atualiza storage_path já definitivo
    const { error: upErr } = await admin
      .from("docs")
      .update({ storage_path })
      .eq("id", docId)
      .eq("empresa_id", empresaId)

    if (upErr) {
      // marca failed (não apaga)
      await admin.from("docs").update({ status: "failed", error: upErr.message }).eq("id", docId).eq("empresa_id", empresaId)
      return NextResponse.json({ ok: false, error: "DOC_PATH_UPDATE_FAILED", details: upErr.message }, { status: 500 })
    }

    // 3) Gera signed upload URL
    const signed = await admin.storage.from(storage_bucket).createSignedUploadUrl(storage_path)

    if (signed.error || !signed.data?.signedUrl || !signed.data?.token) {
      const msg = signed.error?.message ?? "SIGNED_URL_FAILED"
      await admin.from("docs").update({ status: "failed", error: msg }).eq("id", docId).eq("empresa_id", empresaId)
      return NextResponse.json({ ok: false, error: "SIGNED_URL_FAILED", details: msg }, { status: 500 })
    }

    // audit (não bloqueia)
    await admin.from("audit_log").insert({
  empresa_id: empresaId,
  actor_user_id: user.id,
  actor_profile_id: adminCheck.profileId,
  action: "DOC_CREATED",
  entity: "docs",
  entity_id: docId,
  payload: { doc_id: docId, storage_bucket, storage_path, filename, mime_type, size_bytes },
}).catch(() => null)

    return NextResponse.json(
      {
        ok: true,
        doc: {
          id: docId,
          empresa_id: empresaId,
          storage_bucket,
          storage_path,
          created_at: created.created_at,
        },
        upload: { signed_url: signed.data.signedUrl, token: signed.data.token },
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
