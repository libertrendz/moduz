/**
 * =============================================
 * Moduz+ | Gestão de Módulos
 * Arquivo: app/adm/core/modulos/page.tsx
 * Módulo: Core
 * Etapa: UI List + Toggle (v3.5)
 * Descrição:
 *  - Lista módulos por empresa
 *  - Toggle com feedback, loading e tratamento de erro
 *  - Regra Moduz: não permite ativar módulos não implementados (badge "Em breve")
 *  - Responsivo: cards no mobile, tabela no desktop (evita sobreposição)
 *  - Auto-sync:
 *      - recarrega quando trocar empresa ("moduz:empresa-changed")
 *      - emite "moduz:modules-updated" para atualizar header/menu instantaneamente
 *  - Toast Global (via AdmShell) — não empurra layout
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { MODULES, MODULE_ORDER } from "../../../../components/adm/module-registry"
import { useToast } from "../../../../components/ui/toast-context"

type ModuleRow = {
  module_key: string
  enabled: boolean
  enabled_at: string | null
  updated_at: string | null
}

type ListResponse = {
  empresa_id: string
  modules: ModuleRow[]
}

type ToggleResponse =
  | { ok: true; module: ModuleRow; audit?: string; audit_details?: string | null }
  | { error: string; details?: string | null }

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

function getEmpresaId(): string | null {
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

function emitModulesUpdated(empresaId: string, enabledKeys: string[]) {
  try {
    window.dispatchEvent(
      new CustomEvent("moduz:modules-updated", {
        detail: { empresa_id: empresaId, enabled_keys: enabledKeys },
      })
    )
  } catch {
    // ignore
  }
}

export default function ModulosPage() {
  const { showToast } = useToast()

  const [empresaId, setEmpresaId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ModuleRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  const [busyKey, setBusyKey] = useState<string | null>(null)

  const sortedRows = useMemo(() => {
    const map = new Map(rows.map((r) => [r.module_key, r]))
    return MODULE_ORDER.map((k) => map.get(k)).filter(Boolean) as ModuleRow[]
  }, [rows])

  function syncHeaderFrom(nextRows: ModuleRow[], eid: string) {
    const enabled = nextRows.filter((m) => m.enabled).map((m) => m.module_key)
    const keys = Array.from(new Set(["core", ...enabled]))
    emitModulesUpdated(eid, keys)
  }

  async function load(forceEmpresaId?: string | null) {
    setLoading(true)
    setErr(null)

    try {
      const eid = forceEmpresaId ?? getEmpresaId()
      setEmpresaId(eid)

      if (!eid) {
        setRows([])
        setErr("Empresa não definida.")
        return
      }

      const r = await fetch("/api/admin/core/modules/list", {
        method: "GET",
        headers: { "x-empresa-id": eid },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as ListResponse | ToggleResponse | null

      if (!r.ok) {
        const msg =
          (j as any)?.error
            ? `${(j as any).error}${(j as any).details ? `: ${(j as any).details}` : ""}`
            : "Falha ao carregar."
        setErr(msg)
        setRows([])
        return
      }

      const data = j as ListResponse
      const next = Array.isArray(data.modules) ? data.modules : []
      setRows(next)
      syncHeaderFrom(next, eid)
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado ao carregar.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function toggle(module_key: string, enabled: boolean) {
    if (!empresaId) {
      showToast({ kind: "err", msg: "Empresa não definida." })
      return
    }

    const meta = MODULES[module_key]
    const locked = Boolean(meta?.locked)
    const implemented = Boolean(meta?.implemented)

    if (locked) {
      showToast({ kind: "err", msg: "O módulo Core não pode ser desativado." })
      return
    }

    if (!implemented) {
      showToast({ kind: "info", msg: "Módulo ainda não disponível (Em breve)." })
      return
    }

    setBusyKey(module_key)

    // otimista + sync header
    setRows((prev) => {
      const next = prev.map((r) => (r.module_key === module_key ? { ...r, enabled } : r))
      syncHeaderFrom(next, empresaId)
      return next
    })

    try {
      const r = await fetch("/api/admin/core/modules/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-empresa-id": empresaId,
        },
        credentials: "include",
        body: JSON.stringify({ module_key, enabled }),
      })

      const j = (await r.json().catch(() => null)) as ToggleResponse | null

      if (!r.ok || !j) throw new Error((j as any)?.error || "Falha ao atualizar módulo.")

      if ("ok" in j && j.ok === true) {
        setRows((prev) => {
          const next = prev.map((x) => (x.module_key === module_key ? j.module : x))
          syncHeaderFrom(next, empresaId)
          return next
        })

        showToast({ kind: "ok", msg: `Módulo "${module_key}" atualizado.` })
        return
      }

      throw new Error((j as any)?.error || "Falha ao atualizar módulo.")
    } catch (e: any) {
      // rollback + sync header
      setRows((prev) => {
        const next = prev.map((r) =>
          r.module_key === module_key ? { ...r, enabled: !enabled } : r
        )
        syncHeaderFrom(next, empresaId)
        return next
      })

      showToast({ kind: "err", msg: e?.message || "Erro inesperado." })
    } finally {
      setBusyKey(null)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // auto-reload ao trocar empresa no switcher
  useEffect(() => {
    const onEmpresaChanged = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as { empresa_id?: string } | undefined
      const eid = detail?.empresa_id ?? null
      if (!eid) return
      load(eid)
    }

    window.addEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    return () => window.removeEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Gestão de Módulos</h1>
          <p className="mt-2 text-sm text-slate-400">
            Ative/desative módulos por empresa. Core é obrigatório. Módulos “Em breve” não podem ser ativados.
          </p>
        </div>

        <button
          onClick={() => load()}
          className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
        >
          Atualizar
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
          <p className="text-sm text-red-200">{err}</p>
        </div>
      ) : null}

      {/* MOBILE: cards (evita sobreposição) */}
      <div className="mt-6 space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            A carregar…
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            Sem módulos para mostrar.
          </div>
        ) : (
          sortedRows.map((m) => {
            const meta = MODULES[m.module_key] ?? {
              title: m.module_key,
              desc: "—",
              implemented: false,
            }

            const isBusy = busyKey === m.module_key
            const locked = Boolean(meta.locked)
            const implemented = Boolean(meta.implemented)

            const disableToggle = locked || isBusy || !implemented

            return (
              <div key={m.module_key} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={classNames("h-2.5 w-2.5 rounded-full", m.enabled ? "bg-emerald-400" : "bg-slate-600")} />
                      <div className="text-sm font-semibold text-slate-100">{meta.title}</div>
                      <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 font-mono">
                        {m.module_key}
                      </span>
                      {locked ? (
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                          obrigatório
                        </span>
                      ) : null}
                      {!implemented ? (
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                          em breve
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm text-slate-400">{meta.desc}</p>

                    <p className="mt-2 text-xs text-slate-500 font-mono">
                      Atualizado: {formatDt(m.updated_at)}
                    </p>

                    {isBusy ? <p className="mt-2 text-xs text-slate-500">a atualizar…</p> : null}
                  </div>

                  <button
                    onClick={() => toggle(m.module_key, !m.enabled)}
                    disabled={disableToggle}
                    className={classNames(
                      "relative inline-flex h-6 w-11 items-center rounded-full border transition shrink-0",
                      disableToggle ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                      m.enabled ? "bg-emerald-500/20 border-emerald-700" : "bg-slate-900 border-slate-700"
                    )}
                    aria-label={`Toggle ${m.module_key}`}
                    title={locked ? "Obrigatório" : !implemented ? "Em breve" : "Ativar/desativar"}
                  >
                    <span
                      className={classNames(
                        "inline-block h-5 w-5 transform rounded-full bg-slate-100 transition",
                        m.enabled ? "translate-x-5" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* DESKTOP: tabela */}
      <div className="mt-6 hidden md:block overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div className="grid grid-cols-12 gap-0 border-b border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          <div className="col-span-5">Módulo</div>
          <div className="col-span-4">Descrição</div>
          <div className="col-span-2">Atualizado</div>
          <div className="col-span-1 text-right">Ativo</div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-slate-400">A carregar…</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">Sem módulos para mostrar.</div>
        ) : (
          <ul>
            {sortedRows.map((m) => {
              const meta = MODULES[m.module_key] ?? {
                title: m.module_key,
                desc: "—",
                implemented: false,
              }

              const isBusy = busyKey === m.module_key
              const locked = Boolean(meta.locked)
              const implemented = Boolean(meta.implemented)

              const disableToggle = locked || isBusy || !implemented

              return (
                <li
                  key={m.module_key}
                  className="grid grid-cols-12 gap-0 px-4 py-4 border-b border-slate-900 last:border-b-0"
                >
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <div className={classNames("h-2.5 w-2.5 rounded-full", m.enabled ? "bg-emerald-400" : "bg-slate-600")} />
                      <div className="text-sm font-semibold text-slate-100">{meta.title}</div>

                      <span className="ml-2 rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 font-mono">
                        {m.module_key}
                      </span>

                      {locked ? (
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                          obrigatório
                        </span>
                      ) : null}

                      {!implemented ? (
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                          em breve
                        </span>
                      ) : null}

                      {isBusy ? <span className="text-[11px] text-slate-400">a atualizar…</span> : null}
                    </div>
                  </div>

                  <div className="col-span-4 text-sm text-slate-400">{meta.desc}</div>

                  <div className="col-span-2 text-xs text-slate-400 font-mono">
                    {formatDt(m.updated_at)}
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => toggle(m.module_key, !m.enabled)}
                      disabled={disableToggle}
                      className={classNames(
                        "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                        disableToggle ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                        m.enabled ? "bg-emerald-500/20 border-emerald-700" : "bg-slate-900 border-slate-700"
                      )}
                      aria-label={`Toggle ${m.module_key}`}
                      title={locked ? "Obrigatório" : !implemented ? "Em breve" : "Ativar/desativar"}
                    >
                      <span
                        className={classNames(
                          "inline-block h-5 w-5 transform rounded-full bg-slate-100 transition",
                          m.enabled ? "translate-x-5" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
