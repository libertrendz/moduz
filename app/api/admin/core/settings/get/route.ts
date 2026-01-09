/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/core/settings/get/route.ts
 * Módulo: Core (Settings)
 * Etapa: Get (v1.0.1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Verifica perfil admin em public.profiles (empresa_id + user_id)
 *  - Lê settings da empresa (public.settings)
 *  - Se não existir, cria defaults e devolve (idempotente)
 * =============================================
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server"

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

type AdminCheckOk = { ok: true; profileId: string }
type AdminCheckErr = { ok: false; status: number; error: string; details?: string | null }
type AdminCheck = AdminCheckOk | AdminCheckErr

async function assertAdmin(userId: string, empresaId: string): Promise<AdminCheck> {
  const admin = supabaseAdmin()

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: "PROFILE_LOOKUP_FAILED", details: error.message }
  if (!profile || profile.ativo === false) return { ok: false, status: 403, error: "NO_PROFILE" }
  if (profile.role !== "admin") return { ok: false, status: 403, error: "NOT_ADMIN" }

  return { ok: true, profileId: profile.id }
}

export async function GET(req: Request) {
  try {
    const empresaId = getEmpresaId(req)
    if (!empresaId) {
      return NextResponse.json({ ok: false, error: "MISSING_EMPRESA_ID" }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    const user = userRes?.user

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 401 })
    }

    const adminCheck = await assertAdmin(user.id, empresaId)
    if (!adminCheck.ok) {
      // ✅ Moduz-safe: cast explícito para não cair no erro TS "Property 'error' does not exist..."
      const deny = adminCheck as AdminCheckErr
      return NextResponse.json(
        { ok: false, error: deny.error, details: deny.details ?? null },
        { status: deny.status }
      )
    }

    const admin = supabaseAdmin()

    const { data: existing, error: selErr } = await admin
      .from("settings")
      .select("id, empresa_id, timezone, locale, currency, extras, created_at, updated_at")
      .eq("empresa_id", empresaId)
      .maybeSingle()

    if (selErr) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: selErr.message }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json({ ok: true, settings: existing }, { status: 200 })
    }

    // não existe -> cria default (schema já tem defaults, mas garantimos extras etc)
    const { data: created, error: insErr } = await admin
      .from("settings")
      .insert({
        empresa_id: empresaId,
        timezone: "Europe/Lisbon",
        locale: "pt-PT",
        currency: "EUR",
        extras: {},
      })
      .select("id, empresa_id, timezone, locale, currency, extras, created_at, updated_at")
      .single()

    if (insErr || !created) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: insErr?.message ?? null }, { status: 500 })
    }

    return NextResponse.json({ ok: true, settings: created }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
