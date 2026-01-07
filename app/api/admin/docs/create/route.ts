/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/create/route.ts
 * Módulo: Docs
 * Etapa: Create (v1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Valida membro ativo via public.profiles (empresa_id + user_id)
 *  - Cria registo em public.docs
 *  - Gera Signed Upload URL (storage)
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

async function assertMember(userId: string, empresaId: string) {
  const admin = supabaseAdmin()
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle()

  if (error) return { ok: false as const, status: 500, error: "PROFILE_LOOKUP_FAILED", details: error.message }
  if (!profile || profile.ativo === false) return { ok: false as const, status: 403, error: "NO_PROFILE" }
  return { ok: true as const, profileId: profile.id, role: profile.role as string }
}

function safeFileName(name: string) {
  const base = (name || "documento").trim()
  // simples e seguro: remove caminhos, normaliza espaços
  const just = base.split("/").pop()?.split("\\").pop() ?? "documento"
  return just.replace(/\s+/g, " ").slice(0, 180)
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
      return NextResponse.json(
        { ok: false, error: member.error, details: (member as any).details ?? null },
        { status: member.status }
      )
    }

    const body = await req.json().catch(() => null)
    const filename = safeFileName(String(body?.filename ?? "documento"))
    const mime_type = body?.mime_type ? String(body.mime_type) : null
    const size_bytes = body?.size_bytes ? Number(body.size_bytes) : null

    const docId = crypto.randomUUID()
    const bucket = "moduz-docs"
    const storage_path = `empresa/${empresaId}/${docId}/${filename}`

    const admin = supabaseAdmin()

    const { data: doc, error: insErr } = await admin
      .from("docs")
      .insert({
        id: docId,
        empresa_id: empresaId,
        storage_bucket: bucket,
        storage_path,
        filename: filename || null,
        mime_type,
        size_bytes,
        created_by: user.id,
      })
      .select("id, empresa_id, storage_bucket, storage_path, created_at")
      .single()

    if (insErr || !doc) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: insErr?.message ?? null }, { status: 500 })
    }

    // ✅ Moduz: audit nunca pode quebrar o fluxo (sem .catch em builder)
    const { error: auditErr } = await admin.from("audit_log").insert({
      empresa_id: empresaId,
      actor_user_id: user.id,
      actor_profile_id: member.profileId,
      action: "DOC_CREATED",
      entity: "docs",
      entity_table: "docs",
      entity_id: docId,
      payload: {
        doc_id: docId,
        storage_bucket: bucket,
        storage_path,
        filename: filename || null,
        mime_type,
        size_bytes,
      },
    })
    void auditErr

    // Signed Upload URL (não depende de policies)
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
