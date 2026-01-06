/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/complete/route.ts
 * Módulo: Docs
 * Etapa: Complete (v1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Valida membro ativo via public.profiles
 *  - Atualiza metadados em public.docs (filename/mime/size)
 *  - Registra audit_log: DOC_UPLOADED
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
  return { ok: true as const, profileId: profile.id }
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
    const doc_id = String(body?.doc_id ?? "").trim()
    if (!doc_id || doc_id.length < 20) {
      return NextResponse.json({ ok: false, error: "MISSING_DOC_ID" }, { status: 400 })
    }

    const patch: Record<string, any> = {
      created_by: user.id,
    }
    if (body?.filename != null) patch.filename = String(body.filename)
    if (body?.mime_type != null) patch.mime_type = String(body.mime_type)
    if (body?.size_bytes != null) patch.size_bytes = Number(body.size_bytes)

    const admin = supabaseAdmin()

    // Garantir que o doc pertence à empresa
    const { data: updated, error: upErr } = await admin
      .from("docs")
      .update(patch)
      .eq("id", doc_id)
      .eq("empresa_id", empresaId)
      .select("id")
      .maybeSingle()

    if (upErr || !updated) {
      return NextResponse.json(
        { ok: false, error: "DOC_NOT_FOUND_OR_DB_ERROR", details: upErr?.message ?? null },
        { status: 404 }
      )
    }

    const { error: auditErr } = await admin.from("audit_log").insert({
      empresa_id: empresaId,
      actor_user_id: user.id,
      actor_profile_id: member.profileId,
      action: "DOC_UPLOADED",
      entity: "docs",
      entity_table: "docs",
      entity_id: doc_id,
      payload: {
        doc_id,
        filename: patch.filename ?? null,
        mime_type: patch.mime_type ?? null,
        size_bytes: patch.size_bytes ?? null,
      },
    })

    return NextResponse.json(
      { ok: true, doc_id, audit: auditErr ? "FAILED" : "OK", audit_details: auditErr?.message ?? null },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
