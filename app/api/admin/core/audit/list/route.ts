/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/core/audit/list/route.ts
 * Módulo: Core (Auditoria)
 * Etapa: List (v1.0.2)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Verifica perfil admin em public.profiles por empresa_id + user_id
 *  - Lista audit_log por empresa (read-only)
 *  - Paginação simples por cursor (created_at)
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

  if (error) {
    return {
      ok: false as const,
      status: 500,
      error: "PROFILE_LOOKUP_FAILED",
      details: error.message,
    }
  }

  if (!profile || profile.ativo === false) {
    return { ok: false as const, status: 403, error: "NO_PROFILE" }
  }

  if (profile.role !== "admin") {
    return { ok: false as const, status: 403, error: "NOT_ADMIN" }
  }

  return { ok: true as const, profileId: profile.id }
}

function clampInt(v: string | null, min: number, max: number, def: number) {
  const n = v ? Number(v) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
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
      // ✅ Cast explícito (Moduz-safe): evita TS reclamar de ".error" em union
      const deny = adminCheck as AdminCheckErr
      return NextResponse.json(
        { ok: false, error: deny.error, details: deny.details ?? null },
        { status: deny.status }
      )
    }

    const url = new URL(req.url)
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50)
    const cursor = url.searchParams.get("cursor") // created_at ISO (opcional)

    const admin = supabaseAdmin()

    let q = admin
      .from("audit_log")
      .select(
        "id, empresa_id, actor_user_id, actor_profile_id, action, entity_table, entity_id, entity, metadata, payload, created_at"
      )
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (cursor) {
      q = q.lt("created_at", cursor)
    }

    const { data, error } = await q
    if (error) {
      return NextResponse.json({ ok: false, error: "DB_ERROR", details: error.message }, { status: 500 })
    }

    const rows = Array.isArray(data) ? data : []
    const nextCursor = rows.length ? (rows[rows.length - 1] as any)?.created_at ?? null : null

    return NextResponse.json(
      { ok: true, empresa_id: empresaId, items: rows, next_cursor: nextCursor },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
