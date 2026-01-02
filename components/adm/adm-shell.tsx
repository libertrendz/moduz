/**
 * =============================================
 * Moduz+ | Admin Shell
 * Arquivo: components/adm/adm-shell.tsx
 * Módulo: Core (Admin)
 * Etapa: Layout + Menu Dinâmico (v6)
 * Descrição:
 *  - Contexto SSR via cookies (/api/admin/core/context)
 *  - Empresa ativa via localStorage (moduz_empresa_id)
 *  - Menu dinâmico (premium):
 *      - Core sempre
 *      - Demais: somente se (enabled no DB) E (implemented no código) E (tem rota no registry)
 *  - Atualiza menu em tempo real:
 *      - escuta evento window "moduz:modules-changed" disparado pela página de módulos
 *  - Evita “piscadas” removendo o comportamento de limpar o menu em loading
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
import { MODULES, ROUTES_BY_MODULE, type ModuleKey } from "./module-registry"

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

type NavItem = { href: string; label: string }

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

function safeJson<T>(x: any): T | null {
  return x && typeof x === "object" ? (x as T) : null
}

function isModuleKey(x: string): x is ModuleKey {
  return x in MODULES
}

export function AdmShell(props: { children: React.ReactNode }) {
  const { children } = props

  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)

  const [empresas, setEmpresas] = React.useState<EmpresaItem[]>([])
  const [empresaId, setEmpresaId] = React.useState<string | null>(null)

  const [modulesLoading, setModulesLoading] = React.useState(false)
  const [enabledKeys, setEnabledKeys] = React.useState<ModuleKey[]>(["core"])

  // mantém o menu anterior durante loading -> reduz “pisca”
  const [menuItems, setMenuItems] = React.useState<NavItem[]>([
    { href: "/adm", label: "Core" },
  ])

  const [logoOk, setLogoOk] = React.useState(true)

  async function loadContext() {
    setLoading(true)
    setErr(null)

    try {
      const r = await fetch("/api/admin/core/context", { credentials: "include" })
      const j = safeJson<CoreContextResponse>(await r.json().catch(() => null))

      if (!r.ok || !j || (j as any).ok === false) {
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
        empresa_nome: e.nome ?? null,
      }))

      setEmpresas(empresasNormalized)

      const stored = getEmpresaIdFromStorage()
      const allowed = Boolean(stored && empresasNormalized.some((e) => e.empresa_id === stored))

      const nextEmpresa =
        (allowed ? stored : null) ??
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

  async function loadEnabledModules(eid: string) {
    setModulesLoading(true)

    try {
      const r = await fetch("/api/admin/core/modules/list", {
        method: "GET",
        headers: { "x-empresa-id": eid },
        credentials: "include",
      })

      const j = safeJson<ModulesListResponse>(await r.json().catch(() => null))

      if (!r.ok || !j || "error" in j) {
        setEnabledKeys(["core"])
        return
      }

      const enabled = (j.modules ?? [])
        .filter((m) => m.enabled)
        .map((m) => m.module_key)
        .filter((k): k is ModuleKey => typeof k === "string" && isModuleKey(k))

      const uniq = Array.from(new Set<ModuleKey>(["core", ...enabled]))
      setEnabledKeys(uniq)
    } catch {
      setEnabledKeys(["core"])
    } finally {
      setModulesLoading(false)
    }
  }

  function buildMenu(keys: ModuleKey[]): NavItem[] {
    const allowedKeys = keys.filter((k) => {
      if (k === "core") return true
      if (!MODULES[k]?.implemented) return false
      if (!ROUTES_BY_MODULE[k]) return false
      return true
    })

    const sortedKeys = [...allowedKeys].sort((a, b) => {
      if (a === "core") return -1
      if (b === "core") return 1
      const al = ROUTES_BY_MODULE[a]?.label ?? a
      const bl = ROUTES_BY_MODULE[b]?.label ?? b
      return String(al).localeCompare(String(bl))
    })

    return sortedKeys
      .map((k) => ROUTES_BY_MODULE[k])
      .filter(Boolean) as NavItem[]
  }

  React.useEffect(() => {
    loadContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!empresaId) return
    loadEnabledModules(empresaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // sempre que enabledKeys muda, reconstrói menu (sem apagar menu durante loading)
  React.useEffect(() => {
    const next = buildMenu(enabledKeys)
    // evita update desnecessário (menos flicker)
    const same =
      next.length === menuItems.length &&
      next.every((x, i) => x.href === menuItems[i]?.href && x.label === menuItems[i]?.label)

    if (!same) setMenuItems(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledKeys])

  // ✅ escuta mudanças disparadas pela página de módulos (refresh imediato do header)
  React.useEffect(() => {
    const onModulesChanged = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as { empresa_id?: string } | undefined
      const eid = detail?.empresa_id ?? empresaId
      if (!eid) return
      loadEnabledModules(eid)
    }

    window.addEventListener("moduz:modules-changed", onModulesChanged as any)
    return () => window.removeEventListener("moduz:modules-changed", onModulesChanged as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  function onChangeEmpresaId(next: string) {
    setEmpresaId(next)
    setEmpresaIdToStorage(next)
  }

  const headerSubtitle = React.useMemo(() => {
    if (!empresaId) return "Sem empresa ativa"
    const current = empresas.find((e) => e.empresa_id === empresaId)
    const nome = current?.empresa_nome ?? null
    const role = current?.role ?? null
    return `${nome ?? "Empresa"}${role ? ` • ${role}` : ""}`
  }, [empresaId, empresas])

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
            <span className="hidden md:inline text-xs text-slate-500">{headerSubtitle}</span>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-xs text-slate-500">A carregar…</span>
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
            {menuItems.map((it) => (
              <a
                key={it.href}
                href={it.href}
                className={classNames(
                  "rounded-md border px-3 py-1.5 text-sm",
                  "border-slate-900 bg-slate-950 text-slate-200 hover:bg-slate-900",
                  modulesLoading ? "opacity-90" : ""
                )}
              >
                {it.label}
              </a>
            ))}

            {modulesLoading ? (
              <span className="ml-2 text-xs text-slate-500">a atualizar…</span>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
