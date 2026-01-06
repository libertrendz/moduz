/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/signed-url/route.ts
 * Módulo: Docs
 * Etapa: Download signed URL (opcional v1)
 * Descrição:
 *  - Retorna signed URL temporária para download
 *  - Valida sessão + membro ativo + doc pertence à empresa
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
    .select("id, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle()

  if (error) return { ok: false as const, status: 500, error: "PROFILE_LOOKUP_FAILED", details: error.message }
  if (!profile || profile.ativo === false) return { ok: false as const, status: 403, error: "NO_PROFILE" }
  return { ok: true as const }
}

export async function GET(req: Request) {
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

    const url = new URL(req.url)
    const doc_id = (url.searchParams.get("doc_id") ?? "").trim()
    if (!doc_id || doc_id.length < 20) {
      return NextResponse.json({ ok: false, error: "MISSING_DOC_ID" }, { status: 400 })
    }

    const admin = supabaseAdmin()

    const { data: doc, error: dErr } = await admin
      .from("docs")
      .select("id, storage_bucket, storage_path")
      .eq("id", doc_id)
      .eq("empresa_id", empresaId)
      .maybeSingle()

    if (dErr || !doc) {
      return NextResponse.json({ ok: false, error: "DOC_NOT_FOUND", details: dErr?.message ?? null }, { status: 404 })
    }

    const { data: signed, error: sErr } = await admin.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 60)

    if (sErr || !signed?.signedUrl) {
      return NextResponse.json({ ok: false, error: "SIGNED_URL_FAILED", details: sErr?.message ?? null }, { status: 500 })
    }

    return NextResponse.json({ ok: true, signed_url: signed.signedUrl }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
