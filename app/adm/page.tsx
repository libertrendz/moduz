/**
 * =============================================
 * Moduz+ | Admin Home (Core)
 * Arquivo: app/adm/page.tsx
 * Módulo: Core
 * Etapa: Contexto + Cards (v2.1)
 * Descrição:
 *  - Exige sessão via cookies (SSR auth)
 *  - Carrega contexto do Core em /api/admin/core/context
 *  - Carrega módulos habilitados da empresa ativa (/api/admin/core/modules/list)
 *  - Auto-sync: ao trocar empresa no switcher ("moduz:empresa-changed"), recarrega tudo
 *  - Botão "Atualizar" fica como fallback premium
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"

type CoreContextResponse =
  | {
      ok: true
      user: { id: string; email: string | null }
      profile:
        | {
            profile_id: string | null
            display_name: string | null
            role: string | null
            empresa_id: string | null
          }
        | null
      empresas: Array<{
        empresa_id: string
        nome: string | null
        role: string | null
        ativo: boolean
      }>
      default_empresa_id: string | null
    }
  | { ok: false; error: string; details?: string | null }

type ModuleRow = {
  module_key: string
  enabled: boolean
  enabled_at: string | null
  updated_at: string | null
}

type ModulesListResponse =
  | { empresa_id: string; modules: ModuleRow[] }
  | { error: string; details?: string | null }

function safeJson<T>(x: any): T | null {
  return x && typeof x === "object" ? (x as T) : null
}

function getEmpresaIdFromStorage(): string | null {
  try {
    const v = window.localStorage.getItem("moduz_empresa_id")
    return v && v.length > 10 ? v : null
  } catch {
    return null
  }
}

function formatDt(v: string | null) {
  if (!v) return "—"
  try {
    return new Date(v).toLocaleString("pt-PT")
  } catch {
    return v
  }
}

export default function AdmHomePage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [context, setContext] = useState<Extract<CoreContextResponse, { ok: true }> | null>(null)
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [modules, setModules] = useState<ModuleRow[]>([])

  const empresaNome = useMemo(() => {
    if (!context || !empresaId) return null
    return context.empresas?.find((e) => e.empresa_id === empresaId)?.nome ?? null
  }, [context, empresaId])

  const enabledKeys = useMemo(() => {
    return (modules ?? []).filter((m) => m.enabled).map((m) => m.module_key)
  }, [modules])

  async function loadAll(forceEmpresaId?: string | null) {
    setErr(null)
    setLoading(true)

    try {
      // 1) contexto (sempre por cookies)
      const r1 = await fetch("/api/admin/core/context", { credentials: "include" })
      const j1 = safeJson<CoreContextResponse>(await r1.json().catch(() => null))

      if (!r1.ok || !j1 || (j1 as any).ok === false) {
        setContext(null)
        setModules([])
        setEmpresaId(null)
        setErr((j1 as any)?.error ?? "Falha ao carregar contexto.")
        return
      }

      const data = j1 as Extract<CoreContextResponse, { ok: true }>
      setContext(data)

      // 2) empresa ativa: prioridade → force → localStorage → default → primeira
      const stored = getEmpresaIdFromStorage()
      const allowedStored = Boolean(stored && (data.empresas ?? []).some((e) => e.empresa_id === stored))

      const eid =
        forceEmpresaId ??
        (allowedStored ? stored : null) ??
        data.default_empresa_id ??
        data.empresas?.[0]?.empresa_id ??
        null

      setEmpresaId(eid)

      // 3) módulos da empresa ativa (se existir)
      if (!eid) {
        setModules([])
        return
      }

      const r2 = await fetch("/api/admin/core/modules/list", {
        method: "GET",
        headers: { "x-empresa-id": eid },
        credentials: "include",
      })

      const j2 = safeJson<ModulesListResponse>(await r2.json().catch(() => null))

      if (!r2.ok || !j2 || "error" in j2) {
        setModules([])
        return
      }

      setModules(Array.isArray(j2.modules) ? j2.modules : [])
    } catch (e: any) {
      setContext(null)
      setModules([])
      setEmpresaId(null)
      setErr(e?.message ?? "Erro inesperado.")
    } finally {
      setLoading(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    try {
      await loadAll()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ✅ Auto-sync: quando trocar empresa no switcher do header, recarrega contexto + cards
  useEffect(() => {
    const onEmpresaChanged = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as { empresa_id?: string } | undefined
      const eid = detail?.empresa_id ?? null
      if (!eid) return
      loadAll(eid)
    }

    window.addEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    return () => window.removeEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Core</h1>
          <p className="mt-2 text-sm text-slate-400">
            Base do Moduz+: empresas, utilizadores, perfis, definições, módulos e auditoria. Define o contexto da empresa activa.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900 disabled:opacity-60"
          disabled={loading || refreshing}
          title="Recarregar contexto"
        >
          {refreshing ? "A atualizar…" : "Atualizar"}
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
          <p className="text-sm text-red-200">{err}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          A carregar…
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Utilizador</h2>
            <p className="mt-2 text-sm text-slate-300">
              {context?.user?.email ?? context?.user?.id ?? "—"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {context?.profile?.display_name ?? "—"} • {context?.profile?.role ?? "—"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Empresa ativa</h2>
            <p className="mt-2 text-sm text-slate-300">{empresaNome ?? "—"}</p>
            <p className="mt-1 text-xs text-slate-500 font-mono">{empresaId ?? "—"}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">Módulos habilitados</h2>
              <a
                href="/adm/core/modulos"
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
                title="Gestão de Módulos"
              >
                Gestão de Módulos
              </a>
            </div>

            <p className="mt-3 text-sm text-slate-300">
              {enabledKeys.length ? enabledKeys.join(", ") : "—"}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Última atualização:{" "}
              <span className="font-mono">{formatDt(modules?.[0]?.updated_at ?? null)}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
