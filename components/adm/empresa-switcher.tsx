/**
 * =============================================
 * Moduz+ | Empresa Switcher
 * Arquivo: components/adm/empresa-switcher.tsx
 * Módulo: Core (Contexto)
 * Etapa: Switcher UI (v2)
 * Descrição:
 *  - Mostra empresas acessíveis ao utilizador
 *  - Persiste empresa ativa em localStorage (moduz_empresa_id)
 *  - Compatível com contratos antigos e novos:
 *      - empresa_nome (v1)
 *      - nome (v2 /api/admin/core/context)
 *  - UI: mostra nome; fallback para UUID curto
 * =============================================
 */

"use client"

import * as React from "react"

export type EmpresaItem = {
  empresa_id: string
  ativo: boolean
  role?: string | null

  // compat
  empresa_nome?: string | null // v1
  nome?: string | null // v2
}

export function getEmpresaIdFromStorage(): string | null {
  try {
    const v = window.localStorage.getItem("moduz_empresa_id")
    return v && v.length > 10 ? v : null
  } catch {
    return null
  }
}

export function setEmpresaIdToStorage(v: string) {
  try {
    window.localStorage.setItem("moduz_empresa_id", v)
  } catch {
    // ignore
  }
}

function shortId(id: string) {
  if (!id) return "—"
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

export function EmpresaSwitcher(props: {
  empresas: EmpresaItem[]
  activeEmpresaId: string | null
  onChangeEmpresaId: (empresaId: string) => void
}) {
  const { empresas, activeEmpresaId, onChangeEmpresaId } = props

  const options = React.useMemo(() => {
    return (empresas ?? []).filter((e) => e.ativo !== false)
  }, [empresas])

  const current =
    options.find((x) => x.empresa_id === activeEmpresaId) ?? options[0] ?? null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 hidden sm:inline">Empresa</span>

      <select
        className="max-w-[260px] truncate rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-slate-100"
        value={current?.empresa_id ?? ""}
        onChange={(e) => onChangeEmpresaId(e.target.value)}
      >
        {options.map((e) => {
          const name = (e.nome ?? e.empresa_nome ?? "").trim()
          const label = name || shortId(e.empresa_id)
          const role = (e.role ?? "").trim()

          return (
            <option key={e.empresa_id} value={e.empresa_id}>
              {role ? `${label} (${role})` : label}
            </option>
          )
        })}
      </select>
    </div>
  )
}
