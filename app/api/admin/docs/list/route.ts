/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/docs/list/route.ts
 * Módulo: Docs
 * Etapa: List (v1.0.1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Valida membro ativo via public.profiles (empresa_id + user_id)
 *  - Lista últimos 50 documentos da empresa (public.docs)
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
      // Narrowing explícito (TS-safe)
      const err = "error" in member ? member.error : "UNEXPECTED"
      const details = "details" in member ? (member.details ?? null) : null
      const status = "status" in member ? member.status : 500

      return NextResponse.json({ ok: false, error: err, details }, { status })
    }

    const admin = supabaseAdmin()

    const { data, error } = await admin
      .from("docs")
      .select("id, empresa_id, storage_bucket, storage_path, filename, mime_type, size_bytes, created_by, created_at")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        ok: true,
        empresa_id: empresaId,
        docs: data ?? [],
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
