/**
 * =============================================
 * Moduz+ | API Admin (Service Role)
 * Arquivo: app/api/admin/bootstrap/route.ts
 * Módulo: Core
 * Etapa: MVP Técnico – Fase 1 (Bootstrap)
 * Descrição: Cria empresa inicial + settings + módulos base + profile admin (one-time).
 * Segurança: Só executa se ainda não existir empresa/profile. Bloqueia após primeira execução.
 * =============================================
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

type BootstrapPayload = {
  empresa_nome?: string
  empresa_slug?: string
  admin_user_id: string
  admin_display_name?: string
  enable_modules?: string[]
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL")
    const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY")

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 1) Proteção: não rodar se já existe empresa (evita abuso)
    const { count: empresasCount, error: empresasCountErr } = await supabase
      .from("empresas")
      .select("id", { count: "exact", head: true })

    if (empresasCountErr) throw empresasCountErr
    if ((empresasCount ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "Bootstrap já foi executado (empresas já existem)." },
        { status: 409 }
      )
    }

    const body = (await req.json()) as BootstrapPayload

    if (!body?.admin_user_id) {
      return NextResponse.json(
        { ok: false, error: "admin_user_id é obrigatório." },
        { status: 400 }
      )
    }

    // valida UUID básico
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRe.test(body.admin_user_id)) {
      return NextResponse.json(
        { ok: false, error: "admin_user_id inválido (UUID esperado)." },
        { status: 400 }
      )
    }

    const empresa_nome = (body.empresa_nome || "Empresa 1").trim()
    const empresa_slug = (body.empresa_slug || null) as string | null
    const admin_display_name = (body.admin_display_name || "Admin").trim()

    const enable_modules = Array.isArray(body.enable_modules)
      ? body.enable_modules
      : ["core", "docs"]

    // 2) Criar empresa
    const { data: empresa, error: empresaErr } = await supabase
      .from("empresas")
      .insert({
        nome: empresa_nome,
        slug: empresa_slug,
        ativo: true,
      })
      .select("id,nome,slug")
      .single()

    if (empresaErr) throw empresaErr

    // 3) Criar settings default
    const { error: settingsErr } = await supabase.from("settings").insert({
      empresa_id: empresa.id,
      timezone: "Europe/Lisbon",
      locale: "pt-PT",
      currency: "EUR",
      extras: {
        auth_mode: "both", // password padrão + OTP suave
      },
    })
    if (settingsErr) throw settingsErr

    // 4) Ativar módulos base
    const uniqueModules = (enable_modules || [])
  .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
  .map((m) => m.trim())

const seen: Record<string, true> = {}
const modRows = uniqueModules
  .filter((m) => {
    if (seen[m]) return false
    seen[m] = true
    return true
  })
  .map((module_key) => ({
    empresa_id: empresa.id,
    module_key,
    enabled: true,
  }))

    if (modRows.length > 0) {
      const { error: modErr } = await supabase
        .from("modules_enabled")
        .insert(modRows)
      if (modErr) throw modErr
    }

    // 5) Criar profile admin
    const { error: profileErr } = await supabase.from("profiles").insert({
      empresa_id: empresa.id,
      user_id: body.admin_user_id,
      role: "admin",
      ativo: true,
      display_name: admin_display_name,
    })
    if (profileErr) throw profileErr

    // 6) Audit log
    const { error: auditErr } = await supabase.from("audit_log").insert({
      empresa_id: empresa.id,
      actor_user_id: body.admin_user_id,
      action: "core_bootstrap",
      entity_table: "empresas",
      entity_id: empresa.id,
      metadata: {
        enable_modules,
        admin_display_name,
      },
    })
    if (auditErr) throw auditErr

    return NextResponse.json({
      ok: true,
      empresa,
      admin_user_id: body.admin_user_id,
      modules_enabled: enable_modules,
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Erro inesperado no bootstrap.",
        details: err,
      },
      { status: 500 }
    )
  }
}
