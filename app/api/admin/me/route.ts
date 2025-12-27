/**
 * =============================================
 * Moduz+ | API Admin (Service Role)
 * Arquivo: app/api/admin/me/route.ts
 * Módulo: Core
 * Etapa: MVP Técnico – Core Runtime
 * Descrição: Retorna contexto do utilizador (empresas, profile, módulos e settings).
 * Fonte de verdade: DB (profiles, modules_enabled, settings)
 * =============================================
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function getAuthBearer(req: Request): string | null {
  const h = req.headers.get("authorization")
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL")
    const anonKey = mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY")

    const token = getAuthBearer(req)
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization: Bearer <token>" },
        { status: 401 }
      )
    }

    // 1) Validar token do user usando ANON (segurança)
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: userRes, error: userErr } = await authClient.auth.getUser()
    if (userErr || !userRes?.user) {
      return NextResponse.json(
        { ok: false, error: "Invalid session token" },
        { status: 401 }
      )
    }

    const user = userRes.user

    // 2) Ler contexto (service role para queries sem depender de RLS do client)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("id, empresa_id, role, ativo, display_name, created_at")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("created_at", { ascending: true })

    if (profilesErr) throw profilesErr

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email },
        empresas: [],
        active_empresa_id: null,
        profile: null,
        modules_enabled: [],
        settings: null,
      })
    }

    const empresaIds = [...new Set(profiles.map((p) => p.empresa_id))]

    const { data: empresas, error: empresasErr } = await admin
      .from("empresas")
      .select("id, nome, slug, ativo, created_at")
      .in("id", empresaIds)

    if (empresasErr) throw empresasErr

    // regra MVP: se só tem 1 empresa, ela é a ativa sugerida
    const active_empresa_id = empresaIds.length === 1 ? empresaIds[0] : null

    // profile “ativo” do contexto (se 1 empresa, pega o profile dela; se >1, null por enquanto)
    const profile =
      active_empresa_id ? profiles.find((p) => p.empresa_id === active_empresa_id) ?? null : null

    let modules_enabled: string[] = []
    let settings: any = null

    if (active_empresa_id) {
      const { data: mods, error: modsErr } = await admin
        .from("modules_enabled")
        .select("module_key, enabled")
        .eq("empresa_id", active_empresa_id)
        .eq("enabled", true)

      if (modsErr) throw modsErr
      modules_enabled = (mods ?? []).map((m) => m.module_key)

      const { data: st, error: stErr } = await admin
        .from("settings")
        .select("timezone, locale, currency, extras")
        .eq("empresa_id", active_empresa_id)
        .maybeSingle()

      if (stErr) throw stErr
      settings = st ?? null
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email },
      empresas: empresas ?? [],
      active_empresa_id,
      profile,
      modules_enabled,
      settings,
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error", details: err },
      { status: 500 }
    )
  }
}
