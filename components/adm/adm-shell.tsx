/**
 * =============================================
 * Moduz+ | Admin Shell
 * Arquivo: components/adm/adm-shell.tsx
 * Módulo: Core (Admin)
 * Etapa: Layout + Menu Dinâmico (v6.3.2)
 * Descrição:
 *  - Mantém lógica existente (sem mudanças transversais)
 *  - Ajuste pontual: header mobile em 2 linhas
 *  - Ajuste pontual adicional (padrão Moduz): bolinha com cor por módulo no menu (nav)
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
import { usePathname } from "next/navigation"

import { ToastProvider } from "../ui/toast-context"
import { ToastHost } from "../ui/toast-host"
import { ModuleGuard } from "./module-guard"

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

const CORE_ONLY: ModuleKey[] = ["core"]
const LS_ENABLED_PREFIX = "moduz_enabled_modules::"

function getEnabledModulesCache(empresaId: string): ModuleKey[] | null {
  try {
    const raw = window.localStorage.getItem(`${LS_ENABLED_PREFIX}${empresaId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const arr = parsed.filter((x) => typeof x === "string" && isModuleKey(x)) as ModuleKey[]
    return arr.length ? arr : null
  } catch {
    return null
  }
}

function setEnabledModulesCache(empresaId: string, keys: ModuleKey[]) {
  try {
    const uniq = Array.from(new Set(keys.filter(Boolean)))
    window.localStorage.setItem(`${LS_ENABLED_PREFIX}${empresaId}`, JSON.stringify(uniq))
  } catch {
    // ignore
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

  return sortedKeys.map((k) => ROUTES_BY_MODULE[k]).filter(Boolean) as NavItem[]
}

function emitEmpresaChanged(empresaId: string) {
  try {
    window.dispatchEvent(
      new CustomEvent("moduz:empresa-changed", { detail: { empresa_id: empresaId } })
    )
  } catch {
    // ignore
  }
}

/**
 * Cores por módulo (UI) — usado apenas como identificação (bolinha) no menu do header.
 * Fonte de verdade: HEX (objetivo), sem depender do Tailwind safelist.
 */
const MODULE_COLOR_HEX: Record<string, string> = {
  core: "#94a3b8",
  people: "#22c55e",
  finance: "#0f766e",
  bizz: "#f59e0b",
  track: "#ef4444",
  stock: "#f97316",
  assets: "#94a3b8",
  flow: "#8b5cf6",
  docs: "#a3a3a3",
}

function getDotStyle(moduleKey: ModuleKey): React.CSSProperties {
  return { backgroundColor: MODULE_COLOR_HEX[moduleKey] ?? "#64748b" }
}

export function AdmShell(props: { children: React.ReactNode }) {
  const { children } = props
  const pathname = usePathname()

  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)

  const [empresas, setEmpresas] = React.useState<EmpresaItem[]>([])
  const [empresaId, setEmpresaId] = React.useState<string | null>(null)

  const [modulesLoading, setModulesLoading] = React.useState(false)
  const [enabledKeys, setEnabledKeys] = React.useState<ModuleKey[]>(CORE_ONLY)

  const [menuItems, setMenuItems] = React.useState<NavItem[]>([{ href: "/adm", label: "Core" }])

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
        setEnabledKeys(CORE_ONLY)
        setMenuItems([{ href: "/adm", label: "Core" }])
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

        const cached = getEnabledModulesCache(nextEmpresa)
        const keys: ModuleKey[] = cached?.length
          ? Array.from(new Set<ModuleKey>(["core", ...cached]))
          : CORE_ONLY

        setEnabledKeys(keys)
        setMenuItems(buildMenu(keys))
      } else {
        setEmpresaId(null)
        setEnabledKeys(CORE_ONLY)
        setMenuItems([{ href: "/adm", label: "Core" }])
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado ao carregar contexto.")
      setEmpresas([])
      setEmpresaId(null)
      setEnabledKeys(CORE_ONLY)
      setMenuItems([{ href: "/adm", label: "Core" }])
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
if (!r.ok || !j || "error" in j) return

// ✅ Moduz: ignora respostas de outra empresa (evita race com request sem header / //api/...)
if ((j as any).empresa_id && (j as any).empresa_id !== eid) return

      const enabled = (j.modules ?? [])
        .filter((m) => m.enabled)
        .map((m) => m.module_key)
        .filter((k): k is ModuleKey => typeof k === "string" && isModuleKey(k))

      const uniq: ModuleKey[] = Array.from(new Set<ModuleKey>(["core", ...enabled]))

      setEnabledKeys(uniq)
      setEnabledModulesCache(eid, uniq)
      setMenuItems(buildMenu(uniq))
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
    loadEnabledModules(empresaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  React.useEffect(() => {
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as
        | { empresa_id?: string; enabled_keys?: string[] }
        | undefined

      const eid = detail?.empresa_id
      const keysRaw = detail?.enabled_keys

      if (!eid || eid !== empresaId) return
      if (!Array.isArray(keysRaw)) return

      const enabled = keysRaw.filter((x) => typeof x === "string" && isModuleKey(x)) as ModuleKey[]
      const uniq: ModuleKey[] = Array.from(new Set<ModuleKey>(["core", ...enabled]))

      setEnabledKeys(uniq)
      setEnabledModulesCache(eid, uniq)
      setMenuItems(buildMenu(uniq))
    }

    window.addEventListener("moduz:modules-updated", onUpdated as any)
    return () => window.removeEventListener("moduz:modules-updated", onUpdated as any)
  }, [empresaId])

  function onChangeEmpresaId(next: string) {
    setEmpresaId(next)
    setEmpresaIdToStorage(next)

    const cached = getEnabledModulesCache(next)
    const keys: ModuleKey[] = cached?.length
      ? Array.from(new Set<ModuleKey>(["core", ...cached]))
      : CORE_ONLY

    setEnabledKeys(keys)
    setMenuItems(buildMenu(keys))

    emitEmpresaChanged(next)
  }

  const headerSubtitle = React.useMemo(() => {
    if (!empresaId) return "Sem empresa activa"
    const current = empresas.find((e) => e.empresa_id === empresaId)
    const nome = current?.empresa_nome ?? null
    const role = current?.role ?? null
    return `${nome ?? "Empresa"}${role ? ` • ${role}` : ""}`
  }, [empresaId, empresas])

  const isActive = React.useCallback(
    (href: string) => {
      if (!pathname) return false
      if (href === "/adm") return pathname === "/adm"
      return pathname.startsWith(href)
    },
    [pathname]
  )

  // mapa href -> moduleKey (para desenhar dot sem mexer em NavItem/buildMenu)
  const moduleKeyByHref = React.useMemo(() => {
    const map = new Map<string, ModuleKey>()
    ;(Object.keys(ROUTES_BY_MODULE) as ModuleKey[]).forEach((k) => {
      const href = ROUTES_BY_MODULE[k]?.href
      if (href) map.set(href, k)
    })
    // Core (padrão)
    map.set("/adm", "core")
    return map
  }, [])

  return (
    <ToastProvider>
      <div className="min-h-screen bg-black text-slate-100">
        <header className="sticky top-0 z-20 border-b border-slate-900 bg-black/70 backdrop-blur">
          {/* Header */}
          <div className="mx-auto max-w-6xl px-4 py-4">
            {/* Linha 1 */}
            <div className="flex items-center justify-between gap-3">
              <a href="/adm" className="flex items-center gap-3 shrink-0">
                {logoOk ? (
                  <img
                    src="/brand/moduzplus-wordmark-ret.png"
                    alt="Moduz+"
                    className="h-12 w-auto md:h-14 shrink-0 object-contain"
                    onError={() => setLogoOk(false)}
                  />
                ) : (
                  <span className="text-base font-semibold tracking-wide">Moduz+</span>
                )}
              </a>

              <span
                className={classNames(
                  "text-xs text-slate-500 text-right",
                  "max-w-[55vw] truncate",
                  "md:max-w-none md:truncate-0"
                )}
                title={headerSubtitle}
              >
                {headerSubtitle}
              </span>
            </div>

            {/* Linha 2 */}
            <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:flex-nowrap md:justify-end md:gap-3">
              <div className="flex-1 min-w-[220px] md:flex-none">
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
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="/adm/core/modulos"
                  className={classNames(
                    "rounded-md border px-3 py-2 text-xs transition",
                    isActive("/adm/core/modulos")
                      ? "border-slate-700 bg-slate-900 text-slate-50"
                      : "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900"
                  )}
                  title="Gestão de Módulos"
                >
                  Módulos
                </a>

                <a
                  href="/auth/logout"
                  className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
                  title="Sair"
                >
                  Sair
                </a>
              </div>
            </div>
          </div>

          {/* Nav de módulos ativos */}
          <div className="mx-auto max-w-6xl px-4 pb-4">
            <nav className="flex flex-wrap items-center gap-2">
              {menuItems.map((it) => {
                const mk = moduleKeyByHref.get(it.href) ?? "core"
                return (
                  <a
                    key={it.href}
                    href={it.href}
                    className={classNames(
                      "rounded-md border px-3 py-1.5 text-sm transition inline-flex items-center gap-2",
                      isActive(it.href)
                        ? "border-slate-700 bg-slate-900 text-slate-50"
                        : "border-slate-900 bg-slate-950 text-slate-200 hover:bg-slate-900"
                    )}
                  >
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={getDotStyle(mk)} />
                    {it.label}
                  </a>
                )
              })}

              {modulesLoading ? <span className="ml-2 text-xs text-slate-500">a actualizar…</span> : null}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          <ModuleGuard empresaId={empresaId} enabledKeys={enabledKeys}>
            {children}
          </ModuleGuard>
        </main>

        <ToastHost />
      </div>
    </ToastProvider>
  )
}
