/**
 * =============================================
 * Moduz+ | Module Guard
 * Arquivo: components/adm/module-guard.tsx
 * Módulo: Core (Admin)
 * Etapa: Guard por módulo (v1)
 * Descrição:
 *  - Impede acesso por URL directo a módulos não permitidos
 *  - Regras:
 *      - Core sempre permitido
 *      - Demais: apenas se (enabled no DB) E (implemented no código) E (tem rota no registry)
 *  - Emite evento global "moduz:module-denied" com reason (base do popup comercial)
 *  - Redirecciona:
 *      - not_enabled -> /adm/core/modulos
 *      - not_implemented -> /adm
 * =============================================
 */

"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { MODULES, ROUTES_BY_MODULE, type ModuleKey } from "./module-registry"

type DenyReason = "not_enabled" | "not_implemented"

function isModuleKey(x: string): x is ModuleKey {
  return x in MODULES
}

function emitModuleDenied(args: {
  empresa_id: string | null
  module_key: ModuleKey
  reason: DenyReason
  pathname: string
}) {
  try {
    window.dispatchEvent(
      new CustomEvent("moduz:module-denied", {
        detail: {
          empresa_id: args.empresa_id,
          module_key: args.module_key,
          reason: args.reason,
          pathname: args.pathname,
        },
      })
    )
  } catch {
    // ignore
  }
}

function resolveModuleFromPath(pathname: string): ModuleKey | null {
  if (!pathname) return null

  // Core (inclui /adm e /adm/core/**)
  if (pathname === "/adm" || pathname.startsWith("/adm/core")) return "core"

  // Escolhe o match mais específico (href mais longo)
  let best: { key: string; href: string } | null = null
  for (const [key, r] of Object.entries(ROUTES_BY_MODULE)) {
    if (!r?.href) continue
    const href = r.href
    if (href === "/adm") continue
    if (pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href)) {
      if (!best || href.length > best.href.length) best = { key, href }
    }
  }

  if (!best) return null
  if (!isModuleKey(best.key)) return null
  return best.key
}

export function ModuleGuard(props: {
  empresaId: string | null
  enabledKeys: ModuleKey[]
  children: React.ReactNode
}) {
  const { empresaId, enabledKeys, children } = props
  const pathname = usePathname()
  const router = useRouter()

  const [allowed, setAllowed] = React.useState(true)

  React.useEffect(() => {
    const pn = pathname || ""
    const moduleKey = resolveModuleFromPath(pn)

    // Se não conseguimos resolver módulo (rota desconhecida), não bloqueamos aqui
    if (!moduleKey) {
      setAllowed(true)
      return
    }

    // Core nunca bloqueia
    if (moduleKey === "core") {
      setAllowed(true)
      return
    }

    // Se não existir rota declarada no registry, não devia haver menu — mas por URL não deixa passar
    if (!ROUTES_BY_MODULE[moduleKey]) {
      emitModuleDenied({ empresa_id: empresaId, module_key: moduleKey, reason: "not_implemented", pathname: pn })
      setAllowed(false)
      router.replace("/adm")
      return
    }

    // Implementação no código (registry)
    const implemented = Boolean(MODULES[moduleKey]?.implemented)
    if (!implemented) {
      emitModuleDenied({ empresa_id: empresaId, module_key: moduleKey, reason: "not_implemented", pathname: pn })
      setAllowed(false)
      router.replace("/adm")
      return
    }

    // Enabled no DB (já vem do /api/admin/core/modules/list via AdmShell)
    const enabled = enabledKeys.includes(moduleKey)
    if (!enabled) {
      emitModuleDenied({ empresa_id: empresaId, module_key: moduleKey, reason: "not_enabled", pathname: pn })
      setAllowed(false)
      router.replace("/adm/core/modulos")
      return
    }

    setAllowed(true)
  }, [pathname, router, empresaId, enabledKeys])

  if (!allowed) return null
  return <>{children}</>
}
