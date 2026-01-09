/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/core/settings/update/route.ts
 * Módulo: Core (Settings)
 * Etapa: Update (v1.0.1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Verifica perfil admin em public.profiles (empresa_id + user_id)
 *  - Atualiza settings por empresa (public.settings)
 *  - Se settings não existir, cria e atualiza (idempotente)
 *  - Audit_log best-effort (não bloqueia se falhar)
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

// validações leves (Moduz: contrato pequeno, evita lixo)
function normText(v: any, max = 40): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  return s.slice(0, max)
}

function safeJsonObject(v: any): Record<string, any> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  return v as Record<string, any>
}

export async function POST(req: Request) {
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
      const deny = adminCheck as AdminCheckErr
      return NextResponse.json(
        { ok: false, error: deny.error, details: deny.details ?? null },
        { status: deny.status }
      )
    }

    const body = await req.json().catch(() => null)

    // Campos suportados (Moduz: contrato pequeno)
    const timezone = normText(body?.timezone, 60)
    const locale = normText(body?.locale, 20)
    const currency = normText(body?.currency, 10)
    const extras = safeJsonObject(body?.extras)

    const hasAny = timezone !== null || locale !== null || currency !== null || extras !== null
    if (!hasAny) {
      return NextResponse.json({ ok: false, error: "NO_CHANGES" }, { status: 400 })
    }

    const patch: Record<string, any> = {}
    if (timezone !== null) patch.timezone = timezone
    if (locale !== null) patch.locale = locale
    if (currency !== null) patch.currency = currency
    if (extras !== null) patch.extras = extras

    const admin = supabaseAdmin()

    // garante que existe (idempotente)
    const { data: existing, error: selErr } = await admin
      .from("settings")
      .select("id, empresa_id")
      .eq("empresa_id", empresaId)
      .maybeSingle()

    if (selErr) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: selErr.message }, { status: 500 })
    }

    if (!existing) {
      const { error: insErr } = await admin.from("settings").insert({
        empresa_id: empresaId,
        timezone: "Europe/Lisbon",
        locale: "pt-PT",
        currency: "EUR",
        extras: {},
      })
      if (insErr) {
        return NextResponse.json({ ok: false, error: "DB_ERROR", details: insErr.message }, { status: 500 })
      }
    }

    const { data: updated, error: upErr } = await admin
      .from("settings")
      .update(patch)
      .eq("empresa_id", empresaId)
      .select("id, empresa_id, timezone, locale, currency, extras, created_at, updated_at")
      .single()

    if (upErr || !updated) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: upErr?.message ?? null }, { status: 500 })
    }

    // audit_log best-effort (não bloqueia se falhar) — sem .catch (TS não aceita)
    const ok = adminCheck as AdminCheckOk
    const { error: auditErr } = await admin.from("audit_log").insert({
      empresa_id: empresaId,
      actor_user_id: user.id,
      actor_profile_id: ok.profileId,
      action: "SETTINGS_UPDATED",
      entity: "settings",
      entity_table: "settings",
      payload: { patch },
      metadata: {},
    })

    return NextResponse.json(
      { ok: true, settings: updated, audit: auditErr ? "FAILED" : "OK", audit_details: auditErr?.message ?? null },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
