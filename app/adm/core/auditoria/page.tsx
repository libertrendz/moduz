/**
 * =============================================
 * Moduz+ | Core - Auditoria
 * Arquivo: app/adm/core/auditoria/page.tsx
 * Módulo: Core
 * Etapa: Read-only List (v1)
 * Descrição:
 *  - Lista eventos do audit_log por empresa
 *  - Paginação simples (Carregar mais)
 *  - Toast global (AdmShell)
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { useToast } from "../../../../components/ui/toast-context"

type AuditItem = {
  id: string
  empresa_id: string
  actor_user_id: string | null
  actor_profile_id: string | null
  action: string
  entity_table: string | null
  entity_id: string | null
  entity: string | null
  metadata: any
  payload: any
  created_at: string
}

type ListResp =
  | { ok: true; empresa_id: string; items: AuditItem[]; next_cursor: string | null }
  | { ok: false; error: string; details?: string | null }

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

function formatDt(v: string) {
  try {
    return new Date(v).toLocaleString("pt-PT")
  } catch {
    return v
  }
}

function shortId(v: string | null) {
  if (!v) return "—"
  if (v.length <= 12) return v
  return `${v.slice(0, 8)}…${v.slice(-4)}`
}

export default function CoreAuditoriaPage() {
  const { showToast } = useToast()

  const [empresaId, setEmpresaId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [busyMore, setBusyMore] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [items, setItems] = useState<AuditItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  async function load(first = false) {
    const eid = getEmpresaId()
    setEmpresaId(eid)

    if (!eid) {
      setErr("Empresa não definida.")
      setItems([])
      setNextCursor(null)
      setLoading(false)
      return
    }

    if (first) {
      setLoading(true)
      setErr(null)
      setItems([])
      setNextCursor(null)
    }

    try {
      const r = await fetch(`/api/admin/core/audit/list?limit=50`, {
        method: "GET",
        headers: { "x-empresa-id": eid },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as ListResp | null
      if (!r.ok || !j || j.ok !== true) {
        const msg = (j as any)?.error
          ? `${(j as any).error}${(j as any).details ? `: ${(j as any).details}` : ""}`
          : "Falha ao carregar auditoria."
        setErr(msg)
        setItems([])
        setNextCursor(null)
        return
      }

      setItems(j.items ?? [])
      setNextCursor(j.next_cursor ?? null)
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado ao carregar auditoria.")
      setItems([])
      setNextCursor(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!empresaId || !nextCursor) return
    setBusyMore(true)
    try {
      const r = await fetch(`/api/admin/core/audit/list?limit=50&cursor=${encodeURIComponent(nextCursor)}`, {
        method: "GET",
        headers: { "x-empresa-id": empresaId },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as ListResp | null
      if (!r.ok || !j || j.ok !== true) {
        showToast({ kind: "err", msg: (j as any)?.error || "Falha ao carregar mais eventos." })
        return
      }

      setItems((prev) => [...prev, ...(j.items ?? [])])
      setNextCursor(j.next_cursor ?? null)
    } catch (e: any) {
      showToast({ kind: "err", msg: e?.message ?? "Erro inesperado ao carregar mais eventos." })
    } finally {
      setBusyMore(false)
    }
  }

  useEffect(() => {
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // recarrega ao trocar empresa
  useEffect(() => {
    const onEmpresaChanged = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as { empresa_id?: string } | undefined
      const eid = detail?.empresa_id ?? null
      if (!eid) return
      load(true)
    }
    window.addEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    return () => window.removeEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const empty = useMemo(() => !loading && !err && items.length === 0, [loading, err, items.length])

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Auditoria</h1>
          <p className="mt-2 text-sm text-slate-400">
            Log de eventos por empresa (read-only). Serve como trilha de auditoria e base para automações.
          </p>
        </div>

        <button
          onClick={() => load(true)}
          className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
          title="Recarregar"
        >
          Atualizar
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
          <p className="text-sm text-red-200">{err}</p>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div className="grid grid-cols-12 gap-0 border-b border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          <div className="col-span-3">Data</div>
          <div className="col-span-3">Ação</div>
          <div className="col-span-3">Entidade</div>
          <div className="col-span-3 text-right">Actor</div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-slate-400">A carregar…</div>
        ) : empty ? (
          <div className="p-4 text-sm text-slate-400">Sem eventos para mostrar.</div>
        ) : (
          <ul>
            {items.map((it) => (
              <li key={it.id} className="grid grid-cols-12 gap-0 px-4 py-4 border-b border-slate-900 last:border-b-0">
                <div className="col-span-3">
                  <div className="text-sm text-slate-200">{formatDt(it.created_at)}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{shortId(it.id)}</div>
                </div>

                <div className="col-span-3">
                  <div className="text-sm text-slate-100 font-semibold">{it.action}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {it.entity_table ?? it.entity ?? "—"}
                  </div>
                </div>

                <div className="col-span-3">
                  <div className="text-sm text-slate-300">{it.entity_table ?? it.entity ?? "—"}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{shortId(it.entity_id)}</div>
                </div>

                <div className="col-span-3 text-right">
                  <div className="text-sm text-slate-300">{shortId(it.actor_user_id)}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{shortId(it.actor_profile_id)}</div>
                </div>

                {(it.payload || it.metadata) ? (
                  <div className="col-span-12 mt-3">
                    <details className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <summary className="cursor-pointer text-xs text-slate-400">Detalhes</summary>
                      <pre className="mt-2 overflow-auto text-xs text-slate-300">
{JSON.stringify({ payload: it.payload ?? null, metadata: it.metadata ?? null }, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Empresa: <span className="font-mono">{empresaId ?? "—"}</span>
        </div>

        <button
          onClick={loadMore}
          disabled={!nextCursor || busyMore || loading}
          className={classNames(
            "rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900",
            !nextCursor || busyMore || loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
          )}
          title={!nextCursor ? "Sem mais eventos" : "Carregar mais"}
        >
          {busyMore ? "A carregar…" : "Carregar mais"}
        </button>
      </div>
    </div>
  )
}
