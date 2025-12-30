/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/core/context/route.ts
 * Módulo: Core (Contexto)
 * Etapa: Contexto do utilizador (v1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Lista empresas acessíveis via public.profiles (user_id)
 *  - Busca nomes em public.empresas (se existir) como melhoria, mas não bloqueia se falhar
 *  - Retorna default_empresa_id (primeira empresa ativa)
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

type EmpresaCtx = {
  empresa_id: string
  role: string
  ativo: boolean
  empresa_nome: string | null
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    const user = userRes?.user
    if (userErr || !user) return NextResponse.json({ ok: false, error: "MISSING_SESSION" }, { status: 401 })

    const admin = supabaseAdmin()

    // profiles: (id, empresa_id, user_id, role, ativo, display_name...)
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("empresa_id, role, ativo")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (pErr) return NextResponse.json({ ok: false, error: "PROFILES_LOOKUP_FAILED", details: pErr.message }, { status: 500 })

    const activeProfiles = (profiles ?? []).filter((p) => p.ativo !== false)

    const empresaIds = Array.from(new Set(activeProfiles.map((p) => p.empresa_id).filter(Boolean)))

    // Tenta enriquecer com nomes (não bloqueia se falhar)
    const empresaNameById = new Map<string, string>()
    if (empresaIds.length > 0) {
      const { data: empresas, error: eErr } = await admin
        .from("empresas")
        .select("id, nome")
        .in("id", empresaIds)

      if (!eErr && Array.isArray(empresas)) {
        for (const e of empresas) {
          if (e?.id) empresaNameById.set(e.id, e?.nome ?? e.id)
        }
      }
    }

    const empresasCtx: EmpresaCtx[] = activeProfiles.map((p) => ({
      empresa_id: p.empresa_id,
      role: String((p as any).role ?? ""),
      ativo: Boolean((p as any).ativo ?? true),
      empresa_nome: empresaNameById.get(p.empresa_id) ?? null,
    }))

    const defaultEmpresaId = empresasCtx.find((x) => x.ativo)?.empresa_id ?? empresasCtx[0]?.empresa_id ?? null

    return NextResponse.json(
      {
        ok: true,
        user_id: user.id,
        empresas: empresasCtx,
        default_empresa_id: defaultEmpresaId,
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 })
  }
}
