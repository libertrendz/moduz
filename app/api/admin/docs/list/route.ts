/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/list/route.ts
 * Módulo: Docs
 * Etapa: List (v1.1.0)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Valida membro ativo via public.profiles (empresa_id + user_id)
 *  - Lista últimos 50 documentos da empresa (public.docs)
 *  - Moduz+: devolve uploaded_ok (true/false) baseado em audit_log (DOC_UPLOADED)
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

type MemberCheckOk = { ok: true; profileId: string; role: string }
type MemberCheckErr = { ok: false; status: number; error: string; details?: string }
type MemberCheck = MemberCheckOk | MemberCheckErr

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

type DocOut = {
  id: string
  empresa_id: string
  storage_bucket: string
  storage_path: string
  filename: string | null
  mime_type: string | null
  size_bytes: number | null
  created_by: string | null
  created_at: string
  uploaded_ok: boolean
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
        { ok: false, error: member.error, details: member.details ?? null },
        { status: member.status }
      )
    }

    const admin = supabaseAdmin()

    // 1) docs (últimos 50)
    const { data: docs, error: dErr } = await admin
      .from("docs")
      .select("id, empresa_id, storage_bucket, storage_path, filename, mime_type, size_bytes, created_by, created_at")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (dErr) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: dErr.message }, { status: 500 })
    }

    const rows = Array.isArray(docs) ? docs : []
    const ids = rows.map((d: any) => d?.id).filter(Boolean) as string[]

    // 2) audit -> quais docs têm "complete" (DOC_UPLOADED)
    const uploadedSet = new Set<string>()
    if (ids.length > 0) {
      const { data: audits, error: aErr } = await admin
        .from("audit_log")
        .select("entity_id")
        .eq("empresa_id", empresaId)
        .eq("action", "DOC_UPLOADED")
        .in("entity_id", ids)

      if (!aErr && Array.isArray(audits)) {
        for (const a of audits) {
          const id = (a as any)?.entity_id
          if (id) uploadedSet.add(String(id))
        }
      }
    }

    const out: DocOut[] = rows.map((d: any) => ({
      id: d.id,
      empresa_id: d.empresa_id,
      storage_bucket: d.storage_bucket,
      storage_path: d.storage_path,
      filename: d.filename ?? null,
      mime_type: d.mime_type ?? null,
      size_bytes: typeof d.size_bytes === "number" ? d.size_bytes : d.size_bytes ?? null,
      created_by: d.created_by ?? null,
      created_at: d.created_at,
      uploaded_ok: uploadedSet.has(String(d.id)),
    }))

    return NextResponse.json({ ok: true, empresa_id: empresaId, docs: out }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
