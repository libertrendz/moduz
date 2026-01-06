/**
 * =============================================
 * Moduz+ | Docs
 * Arquivo: app/adm/docs/page.tsx
 * Módulo: Docs
 * Etapa: List (v1)
 * Descrição:
 *  - Lista documentos por empresa (top 200)
 *  - Download via signed URL
 *  - Link para Upload
 *  - Padrão Moduz: empresa_id via localStorage + header x-empresa-id
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { useToast } from "../../../components/ui/toast-context"

type DocRow = {
  id: string
  storage_path: string
  filename: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  ref_table: string | null
  ref_id: string | null
}

type ListResponse =
  | { ok: true; empresa_id: string; docs: DocRow[] }
  | { ok: false; error: string; details?: string | null }

type DownloadResponse =
  | { ok: true; url: string }
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

function formatBytes(n: number | null) {
  if (!n || n <= 0) return "—"
  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024
  if (n >= gb) return `${(n / gb).toFixed(2)} GB`
  if (n >= mb) return `${(n / mb).toFixed(2)} MB`
  if (n >= kb) return `${(n / kb).toFixed(2)} KB`
  return `${n} B`
}

export default function DocsHomePage() {
  const { showToast } = useToast()

  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const hasDocs = useMemo(() => docs.length > 0, [docs])

  async function load(forceEmpresaId?: string | null) {
    setLoading(true)
    setErr(null)

    try {
      const eid = forceEmpresaId ?? getEmpresaId()
      setEmpresaId(eid)

      if (!eid) {
        setDocs([])
        setErr("Selecione uma empresa para continuar.")
        return
      }

      const r = await fetch("/api/admin/docs/list", {
        method: "GET",
        headers: { "x-empresa-id": eid },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as ListResponse | null
      if (!r.ok || !j) {
        setDocs([])
        setErr((j as any)?.error ?? "Falha ao carregar documentos.")
        return
      }

      if ("ok" in j && j.ok === false) {
        setDocs([])
        setErr(j.error)
        return
      }

      // ✅ Moduz: ignora respostas que não correspondam à empresa selecionada
      if (j.empresa_id && j.empresa_id !== eid) return

      setDocs(Array.isArray(j.docs) ? j.docs : [])
    } catch (e: any) {
      setDocs([])
      setErr(e?.message ?? "Erro inesperado ao carregar.")
    } finally {
      setLoading(false)
    }
  }

  async function download(docId: string) {
    if (!empresaId) {
      showToast({ kind: "err", msg: "Empresa não definida." })
      return
    }

    setBusyId(docId)

    try {
      const r = await fetch(`/api/admin/docs/download-url?id=${encodeURIComponent(docId)}`, {
        method: "GET",
        headers: { "x-empresa-id": empresaId },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as DownloadResponse | null
      if (!r.ok || !j) throw new Error((j as any)?.error ?? "Falha ao gerar link.")

      if ("ok" in j && j.ok === true) {
        window.open(j.url, "_blank", "noopener,noreferrer")
        return
      }

      throw new Error((j as any)?.error ?? "Falha ao gerar link.")
    } catch (e: any) {
      showToast({ kind: "err", msg: e?.message ?? "Erro inesperado." })
    } finally {
      setBusyId(null)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recarrega quando trocar empresa no switcher (AdmShell emite o evento)
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
          <h1 className="text-2xl font-semibold text-slate-50">Docs</h1>
          <p className="mt-2 text-sm text-slate-400">
            Documentos e anexos da empresa, ligados a registos e processos. Upload via Storage (Signed URL).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/adm/docs/upload"
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
          >
            Upload
          </a>

          <button
            onClick={() => load()}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
          >
            Atualizar
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
          <p className="text-sm text-red-200">{err}</p>
        </div>
      ) : null}

      {/* MOBILE: cards */}
      <div className="mt-6 space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            A carregar…
          </div>
        ) : !hasDocs ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            Ainda não há uploads nesta empresa. Clique em <span className="text-slate-200">Upload</span>.
          </div>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {d.filename ?? d.id}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 font-mono">
                    {d.mime_type ?? "—"} • {formatBytes(d.size_bytes)}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 font-mono">
                    {formatDt(d.created_at)}
                  </div>
                  {d.ref_table || d.ref_id ? (
                    <div className="mt-2 text-xs text-slate-500 font-mono">
                      Ref: {d.ref_table ?? "—"} / {d.ref_id ?? "—"}
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={() => download(d.id)}
                  disabled={busyId === d.id}
                  className={classNames(
                    "rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900 shrink-0",
                    busyId === d.id ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  {busyId === d.id ? "A gerar…" : "Abrir"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP: tabela */}
      <div className="mt-6 hidden md:block overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div className="grid grid-cols-12 gap-0 border-b border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          <div className="col-span-5">Documento</div>
          <div className="col-span-3">Tipo</div>
          <div className="col-span-2">Tamanho</div>
          <div className="col-span-2 text-right">Ações</div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-slate-400">A carregar…</div>
        ) : !hasDocs ? (
          <div className="p-4 text-sm text-slate-400">
            Ainda não há uploads nesta empresa. Clique em <span className="text-slate-200">Upload</span>.
          </div>
        ) : (
          <ul>
            {docs.map((d) => (
              <li
                key={d.id}
                className="grid grid-cols-12 gap-0 px-4 py-4 border-b border-slate-900 last:border-b-0 items-center"
              >
                <div className="col-span-5 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {d.filename ?? d.id}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 font-mono">
                    {formatDt(d.created_at)}
                    {d.ref_table || d.ref_id ? (
                      <>
                        {" "}
                        • Ref: {d.ref_table ?? "—"} / {d.ref_id ?? "—"}
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="col-span-3 text-sm text-slate-400 truncate">
                  {d.mime_type ?? "—"}
                </div>

                <div className="col-span-2 text-sm text-slate-400 font-mono">
                  {formatBytes(d.size_bytes)}
                </div>

                <div className="col-span-2 flex justify-end">
                  <button
                    onClick={() => download(d.id)}
                    disabled={busyId === d.id}
                    className={classNames(
                      "rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900",
                      busyId === d.id ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    {busyId === d.id ? "A gerar…" : "Abrir"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 text-xs text-slate-500">
        {empresaId ? (
          <span className="font-mono">empresa_id: {empresaId}</span>
        ) : (
          <span>empresa_id: —</span>
        )}
      </div>
    </div>
  )
}
