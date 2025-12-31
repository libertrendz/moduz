/**
 * =============================================
 * Moduz+ | Admin Shell
 * Arquivo: components/adm/adm-shell.tsx
 * Módulo: Core (Admin)
 * Etapa: Layout + Menu dinâmico (v3)
 * Descrição:
 *  - Carrega contexto (empresas) e define empresa ativa automaticamente
 *  - Carrega módulos enabled da empresa
 *  - Menu curto e dinâmico (somente enabled + implemented)
 *  - Wordmark aplicado (public/brand)
 *  - UI limpa: remove empresa_id visível (era debug)
 * =============================================
 */

"use client"

import * as React from "react"
import {
  EmpresaSwitcher,
  type EmpresaItem,
  getEmpresaIdFromStorage,
  setEmpresaIdToStorage,
} from "./empresa-switcher"
import { MODULES, ROUTES_BY_MODULE } from "./module-registry"

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

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

export function AdmShell(props: { children: React.ReactNode }) {
  const { children } = props

  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)

  const [empresas, setEmpresas] = React.useState<EmpresaItem[]>([])
  const [empresaId, setEmpresaId] = React.useState<string | null>(null)

  const [modulesEnabled, setModulesEnabled] = React.useState<string[]>([])
  const [modulesLoading, setModulesLoading] = React.useState(false)

  const [logoOk, setLogoOk] = React.useState(true)

  async function loadContext() {
    setLoading(true)
    setErr(null)

    try {
      const r = await fetch("/api/admin/core/context", {
        credentials: "include",
      })
      const j = (await r.json().catch(() => null)) as CoreContextResponse | null

      if (!r.ok || !j || j.ok === false) {
        setErr((j as any)?.error ?? "Falha ao carregar contexto.")
        setEmpresas([])
        setEmpresaId(null)
        return
      }

      const data = j as Extract<CoreContextResponse, { ok: true }>

      const empresasNormalized: EmpresaItem[] = (data.empresas ?? []).map((e) => ({
        empresa_id: e.empresa_id,
        ativo: e.ativo !== false,
        role: e.role ?? "",
        nome: e.nome ?? null,
      }))

      setEmpresas(empresasNormalized)

      const stored = getEmpresaIdFromStorage()
      const allowed = empresasNormalized?.some((e) => e.empresa_id === stored)
      const nextEmpresa =
        (stored && allowed ? stored : null) ??
        data.default_empresa_id ??
        empresasNormalized?.[0]?.empresa_id ??
        null

      if (nextEmpresa) {
        setEmpresaId(nextEmpresa)
        setEmpresaIdToStorage(nextEmpresa)
      } else {
        setEmpresaId(null)
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado ao carregar contexto.")
      setEmpresas([])
      setEmpresaId(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadModules(eid: string) {
    setModulesLoading(true)
    try {
      const r = await fetch("/api/admin/core/modules/list", {
        method: "GET",
        headers: { "x-empresa-id": eid },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as ModulesListResponse | null

      if (!r.ok || !j) {
        setModulesEnabled([])
        return
      }

      if ("modules" in j && Array.isArray(j.modules)) {
        const enabled = j.modules.filter((m) => m.enabled).map((m) => m.module_key)
        if (!enabled.includes("core")) enabled.unshift("core")
        setModulesEnabled(enabled)
      } else {
        setModulesEnabled([])
      }
    } catch {
      setModulesEnabled([])
    } finally {
      setModulesLoading(false)
    }
  }

  React.useEffect(() => {
    loadContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!empresaId) return
    loadModules(empresaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  function onChangeEmpresaId(next: string) {
    setEmpresaId(next)
    setEmpresaIdToStorage(next)
  }

  const visibleMenu = React.useMemo(() => {
    const enabled = modulesEnabled.length ? modulesEnabled : ["core"]

    const keys = enabled.filter((k) => {
      if (k === "core") return true
      const meta = MODULES[k]
      return Boolean(meta?.implemented)
    })

    const items = keys.map((k) => ROUTES_BY_MODULE[k]).filter(Boolean)
    items.sort((a, b) =>
      a.label === "Core" ? -1 : b.label === "Core" ? 1 : a.label.localeCompare(b.label)
    )

    return items
  }, [modulesEnabled])

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <a href="/adm" className="flex items-center gap-3">
              {logoOk ? (
                <img
                  src="/brand/moduzplus-wordmark-ret.png"
                  alt="Moduz+"
                  className="h-12 w-auto md:h-14 shrink-0"
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <span className="text-base font-semibold tracking-wide">Moduz+</span>
              )}
            </a>
            <span className="hidden md:inline text-xs text-slate-500">ERP modular</span>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-xs text-slate-500">A carregar contexto…</span>
            ) : err ? (
              <span className="text-xs text-red-300">{err}</span>
            ) : (
              <EmpresaSwitcher
                empresas={empresas}
                activeEmpresaId={empresaId}
                onChangeEmpresaId={onChangeEmpresaId}
              />
            )}

            <a
              href="/adm/core/modulos"
              className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
              title="Gestão de Módulos"
            >
              Módulos
            </a>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-4">
          <nav className="flex flex-wrap items-center gap-2">
            {modulesLoading ? (
              <span className="text-xs text-slate-500">A carregar módulos…</span>
            ) : (
              visibleMenu.map((it) => (
                <a
                  key={it.href}
                  href={it.href}
                  className={classNames(
                    "rounded-md border px-3 py-1.5 text-sm",
                    "border-slate-900 bg-slate-950 text-slate-200 hover:bg-slate-900"
                  )}
                >
                  {it.label}
                </a>
              ))
            )}
          </nav>

          {/* REMOVIDO: empresa_id visível aqui (era debug) */}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
