/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/create/route.ts
 * Módulo: Docs
 * Etapa: Create (v1.1 - vínculo semântico + path por módulo)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Valida membro ativo via public.profiles (empresa_id + user_id)
 *  - Cria registo em public.docs (inclui ref_table/ref_id quando fornecidos)
 *  - Gera Signed Upload URL (storage)
 *  - Organiza storage_path por empresa + escopo (módulo/entidade)
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

type MemberCheck =
  | { ok: true; profileId: string; role: string }
  | { ok: false; status: number; error: string; details?: string }

async function assertMember(userId: string, empresaId: string): Promise<MemberCheck> {
  const admin = supabaseAdmin()
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: "PROFILE_LOOKUP_FAILED", details: error.message }
  if (!profile || profile.ativo === false) return { ok: false, status: 403, error: "NO_PROFILE" }

  return { ok: true, profileId: profile.id, role: profile.role as string }
}

function safeFileName(name: string) {
  const base = (name || "documento").trim()
  const just = base.split("/").pop()?.split("\\").pop() ?? "documento"
  return just.replace(/\s+/g, " ").slice(0, 180)
}

function safePathSegment(v: string) {
  // segmento “path-safe”: sem barras, sem chars estranhos
  const s = String(v || "").trim().toLowerCase()
  const cleaned = s
    .replace(/[/\\]/g, "-")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return cleaned || "geral"
}

function safeUuidOrNull(v: any): string | null {
  const s = String(v ?? "").trim()
  // validação leve (não “bloqueia” UUIDs válidos)
  if (!s || s.length < 20) return null
  return s
}

export async function POST(req: Request) {
  try {
    const empresaId = getEmpresaId(req)
    if (!empresaId) return NextResponse.json({ ok: false, error: "MISSING_EMPRESA_ID" }, { status: 400 })

    const supabase = createSupabaseServerClient()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    const user = userRes?.user
    if (userErr || !user) return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 401 })

    const member = await assertMember(user.id, empresaId)
    if (!member.ok) {
      const err = "error" in member ? member.error : "UNEXPECTED"
      const details = "details" in member ? (member.details ?? null) : null
      const status = "status" in member ? member.status : 500
      return NextResponse.json({ ok: false, error: err, details }, { status })
    }

    const body = await req.json().catch(() => null)

    const filename = safeFileName(String(body?.filename ?? "documento"))
    const mime_type = body?.mime_type ? String(body.mime_type) : null
    const size_bytes = body?.size_bytes ? Number(body.size_bytes) : null

    // vínculo semântico (bónus)
    const moduleKey = body?.module_key ? String(body.module_key).trim().toLowerCase() : null
    const ref_table_raw = body?.ref_table != null ? String(body.ref_table).trim() : null
    const ref_id = safeUuidOrNull(body?.ref_id)

    // regra Moduz+: se veio module_key e não veio ref_table, usamos namespace module:<key>
    const ref_table = ref_table_raw && ref_table_raw.length > 0 ? ref_table_raw : moduleKey ? `module:${moduleKey}` : null

    const docId = crypto.randomUUID()
    const bucket = "moduz-docs"

    // organização por “escopo” para ficar previsível no Storage
    const scopeSeg = safePathSegment(ref_table ?? "geral")
    const refSeg = safePathSegment(ref_id ?? "root")
    const storage_path = `empresa/${empresaId}/${scopeSeg}/${refSeg}/${docId}/${filename}`

    const admin = supabaseAdmin()

    const { data: doc, error: insErr } = await admin
      .from("docs")
      .insert({
        id: docId,
        empresa_id: empresaId,
        ref_table: ref_table,
        ref_id: ref_id,
        storage_bucket: bucket,
        storage_path,
        filename: filename || null,
        mime_type,
        size_bytes,
        created_by: user.id,
      })
      .select("id, empresa_id, ref_table, ref_id, storage_bucket, storage_path, created_at")
      .single()

    if (insErr || !doc) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: insErr?.message ?? null }, { status: 500 })
    }

    const { data: up, error: upErr } = await admin.storage.from(bucket).createSignedUploadUrl(storage_path)
    if (upErr || !up?.signedUrl || !up?.token) {
      return NextResponse.json(
        { ok: false, error: "SIGNED_UPLOAD_FAILED", details: upErr?.message ?? null },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        doc,
        upload: { signed_url: up.signedUrl, token: up.token },
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
