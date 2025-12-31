/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/core/context/route.ts
 * Módulo: Core (Contexto)
 * Etapa: Contexto do utilizador (v2 - contrato estável)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Lista empresas acessíveis via public.profiles (user_id)
 *  - Enriquecer nomes via public.empresas (id->nome)
 *  - Retorna user(email), profile(display_name/role), empresas(nome), default_empresa_id
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

type EmpresaOut = {
  empresa_id: string
  nome: string | null
  role: string | null
  ativo: boolean
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    const user = userRes?.user

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 401 })
    }

    const admin = supabaseAdmin()

    // profiles: id, empresa_id, user_id, role, ativo, display_name...
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, empresa_id, role, ativo, display_name, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (pErr) {
      return NextResponse.json(
        { ok: false, error: "PROFILES_LOOKUP_FAILED", details: pErr.message },
        { status: 500 }
      )
    }

    const activeProfiles = (profiles ?? []).filter((p) => p.ativo !== false)
    const empresaIds = Array.from(
      new Set(activeProfiles.map((p) => p.empresa_id).filter(Boolean))
    ) as string[]

    // Enriquecer nome da empresa
    const nameById = new Map<string, string>()
    if (empresaIds.length > 0) {
      const { data: empresas, error: eErr } = await admin
        .from("empresas")
        .select("id, nome")
        .in("id", empresaIds)

      if (!eErr && Array.isArray(empresas)) {
        for (const e of empresas) {
          if (e?.id) nameById.set(e.id, e?.nome ?? e.id)
        }
      }
    }

    const empresasOut: EmpresaOut[] = activeProfiles.map((p) => ({
      empresa_id: p.empresa_id,
      nome: nameById.get(p.empresa_id) ?? null,
      role: (p as any)?.role ?? null,
      ativo: Boolean((p as any)?.ativo ?? true),
    }))

    const defaultEmpresaId =
      empresasOut.find((x) => x.ativo)?.empresa_id ??
      empresasOut[0]?.empresa_id ??
      null

    // Profile "principal" (primeira ativa)
    const primary = activeProfiles[0] ?? null

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email ?? null,
        },
        profile: primary
          ? {
              profile_id: primary.id ?? null,
              display_name: (primary as any)?.display_name ?? null,
              role: (primary as any)?.role ?? null,
              empresa_id: primary.empresa_id ?? null,
            }
          : null,
        empresas: empresasOut,
        default_empresa_id: defaultEmpresaId,
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
