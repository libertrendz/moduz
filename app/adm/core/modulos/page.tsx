/**
 * =============================================
 * Moduz+ | Gestão de Módulos
 * Arquivo: app/adm/core/modulos/page.tsx
 * Módulo: Core
 * Etapa: UI List + Toggle (v2)
 * Descrição:
 *  - Lista módulos por empresa
 *  - Toggle com feedback, loading e tratamento de erro
 *  - Regra Moduz: não permite ativar módulos não implementados (badge "Em breve")
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { MODULES, MODULE_ORDER } from "../../../../components/adm/module-registry"

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

export default function ModulosPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ModuleRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null)

  const sortedRows = useMemo(() => {
    const map = new Map(rows.map((r) => [r.module_key, r]))
    return MODULE_ORDER.map((k) => map.get(k)).filter(Boolean) as ModuleRow[]
  }, [rows])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const eid = getEmpresaId()
      setEmpresaId(eid)

      if (!eid) {
        setRows([])
        setErr("EMPRESA_ID_AUSENTE: contexto não definiu empresa ativa.")
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
      setRows(Array.isArray(data.modules) ? data.modules : [])
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado ao carregar.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function toggle(module_key: string, enabled: boolean) {
    if (!empresaId) {
      setToast({ kind: "err", msg: "Empresa não definida." })
      return
    }

    const meta = MODULES[module_key]
    const locked = Boolean(meta?.locked)
    const implemented = Boolean(meta?.implemented)

    if (locked) {
      setToast({ kind: "err", msg: "O módulo Core não pode ser desativado." })
      return
    }

    if (!implemented) {
      setToast({ kind: "err", msg: "Módulo ainda não disponível (Em breve)." })
      return
    }

    setBusyKey(module_key)
    setToast(null)

    // otimista
    setRows((prev) => prev.map((r) => (r.module_key === module_key ? { ...r, enabled } : r)))

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

      if (!r.ok || !j) {
        throw new Error((j as any)?.error || "Falha ao atualizar módulo.")
      }

      if ("ok" in j && j.ok === true) {
        setRows((prev) => prev.map((x) => (x.module_key === module_key ? j.module : x)))
        setToast({ kind: "ok", msg: `Módulo "${module_key}" atualizado.` })
        return
      }

      throw new Error((j as any)?.error || "Falha ao atualizar módulo.")
    } catch (e: any) {
      // rollback
      setRows((prev) => prev.map((r) => (r.module_key === module_key ? { ...r, enabled: !enabled } : r)))
      setToast({ kind: "err", msg: e?.message || "Erro inesperado." })
    } finally {
      setBusyKey(null)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [toast])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Gestão de Módulos</h1>
          <p className="mt-2 text-sm text-slate-400">
            Ative/desative módulos por empresa. Core é obrigatório. Módulos “Em breve” não podem ser ativados.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Empresa:{" "}
            <span className="font-mono text-slate-300">{empresaId ?? "—"}</span>
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
        >
          Atualizar
        </button>
      </div>

      {toast ? (
        <div
          className={classNames(
            "mt-4 rounded-lg border px-3 py-2 text-sm",
            toast.kind === "ok"
              ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-200"
              : "border-red-900/60 bg-red-950/30 text-red-200"
          )}
        >
          {toast.msg}
        </div>
      ) : null}

      {err ? (
        <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
          <p className="text-sm text-red-200">{err}</p>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
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
                      <div
                        className={classNames(
                          "h-2.5 w-2.5 rounded-full",
                          m.enabled ? "bg-emerald-400" : "bg-slate-600"
                        )}
                      />
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

                      {isBusy ? (
                        <span className="text-[11px] text-slate-400">a atualizar…</span>
                      ) : null}
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
                      title={
                        locked
                          ? "Obrigatório"
                          : !implemented
                          ? "Em breve"
                          : "Ativar/desativar"
                      }
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

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Notas</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-400 space-y-1">
          <li>Core e Docs podem estar ativos por padrão (seed). O Core é bloqueado.</li>
          <li>Módulos marcados como <span className="font-mono text-slate-300">em breve</span> ainda não estão implementados na app.</li>
          <li>O menu do /adm mostra apenas módulos <span className="font-mono text-slate-300">enabled</span> e <span className="font-mono text-slate-300">implemented</span>.</li>
        </ul>
      </div>
    </div>
  )
}
