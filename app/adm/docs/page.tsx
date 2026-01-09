/**
 * =============================================
 * Moduz+ | Docs
 * Arquivo: app/adm/docs/page.tsx
 * Módulo: Docs
 * Etapa: MVP Upload (v1.0.3+)
 * Descrição:
 *  - Upload via Signed Upload URL (server-side) -> não depende de policies no bucket
 *  - Cria registo em public.docs + finaliza metadados + audit_log
 *  - Lista histórico (últimos 50) via /api/admin/docs/list
 *  - Bónus (Moduz+):
 *      - create envia module_key="docs" (vínculo semântico: ref_table="module:docs")
 *      - cache local (30s) por empresa para histórico (melhor UX)
 *      - reage a troca de empresa (evento moduz:empresa-changed)
 *  - UX Moduz:
 *      - "Estado" não depende só da sessão (usa histórico quando existe)
 *      - Mostra resumo e status por linha (quando disponível)
 *      - Detalhes técnicos (doc_id/path) colapsáveis
 *  - Hard rule Moduz: não explodir UI por ENV ausente (mostrar erro controlado)
 * =============================================
 */

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { useToast } from "../../../components/ui/toast-context"

type CreateResp =
  | {
      ok: true
      doc: {
        id: string
        empresa_id: string
        storage_bucket: string
        storage_path: string
        created_at: string
      }
      upload: { signed_url: string; token: string }
    }
  | { ok: false; error: string; details?: string | null }

type CompleteResp =
  | { ok: true; doc_id: string; audit?: string; audit_details?: string | null }
  | { ok: false; error: string; details?: string | null }

type DocRow = {
  id: string
  empresa_id: string
  storage_bucket: string
  storage_path: string
  filename: string | null
  mime_type: string | null
  size_bytes: number | null
  created_by: string | null
  created_at: string

  /**
   * Opcional (padrão Moduz+):
   * - se o endpoint /api/admin/docs/list devolver uploaded_ok, a UI mostra status por linha.
   * - se não devolver, a UI mantém compatibilidade sem quebrar.
   */
  uploaded_ok?: boolean | null
}

type ListResp =
  | { ok: true; empresa_id: string; docs: DocRow[] }
  | { ok: false; error: string; details?: string | null }

function getEmpresaId(): string | null {
  try {
    const v = window.localStorage.getItem("moduz_empresa_id")
    return v && v.length > 10 ? v : null
  } catch {
    return null
  }
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let x = n
  while (x >= 1024 && i < units.length - 1) {
    x = x / 1024
    i++
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDt(v: string) {
  try {
    return new Date(v).toLocaleString("pt-PT")
  } catch {
    return v
  }
}

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

function statusLabel(v: boolean | null | undefined) {
  if (v === true) return "OK"
  if (v === false) return "Pendente"
  return "—"
}

/**
 * Cache leve (Moduz+): histórico por empresa com TTL curto (evita piscar e acelera reload)
 */
const LS_DOCS_CACHE_PREFIX = "moduz_docs_list_cache::"
const DOCS_CACHE_TTL_MS = 30_000

type DocsCachePayload = {
  ts: number
  empresa_id: string
  docs: DocRow[]
}

function cacheKey(empresaId: string) {
  return `${LS_DOCS_CACHE_PREFIX}${empresaId}`
}

function readCache(empresaId: string): DocRow[] | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(empresaId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DocsCachePayload
    if (!parsed || typeof parsed !== "object") return null
    if (parsed.empresa_id !== empresaId) return null
    if (!Array.isArray(parsed.docs)) return null
    if (typeof parsed.ts !== "number") return null
    if (Date.now() - parsed.ts > DOCS_CACHE_TTL_MS) return null
    return parsed.docs
  } catch {
    return null
  }
}

function writeCache(empresaId: string, docs: DocRow[]) {
  try {
    const payload: DocsCachePayload = { ts: Date.now(), empresa_id: empresaId, docs }
    window.localStorage.setItem(cacheKey(empresaId), JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export default function DocsHomePage() {
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<{
    doc_id: string
    filename: string
    size_bytes: number
    storage_bucket: string
    storage_path: string
    created_at: string
  } | null>(null)

  const [listLoading, setListLoading] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])

  // ENV pública (não pode "throwar" no client)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null

    // Upload ao signed URL requer supabase client (anon) no browser
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }, [supabaseUrl, supabaseAnonKey])

  const envMissing = !supabaseUrl || !supabaseAnonKey

  async function onPickFile() {
    inputRef.current?.click()
  }

  async function loadList(opts?: { preferCache?: boolean }) {
    const empresaId = getEmpresaId()
    if (!empresaId) {
      setDocs([])
      setListErr("Empresa não definida.")
      return
    }

    // ✅ UX Moduz+: se houver cache válida, mostra já (sem “piscar”)
    if (opts?.preferCache) {
      const cached = readCache(empresaId)
      if (cached && cached.length) {
        setDocs(cached)
        setListErr(null)
      }
    }

    setListLoading(true)
    setListErr(null)

    try {
      const r = await fetch("/api/admin/docs/list", {
        method: "GET",
        headers: { "x-empresa-id": empresaId },
        credentials: "include",
      })

      const j = (await r.json().catch(() => null)) as ListResp | null
      if (!r.ok || !j || j.ok !== true) {
        setDocs([])
        setListErr((j as any)?.error ? String((j as any).error) : "Falha ao carregar histórico.")
        return
      }

      const arr = Array.isArray(j.docs) ? j.docs : []
      setDocs(arr)
      writeCache(empresaId, arr)
    } catch (e: any) {
      setDocs([])
      setListErr(e?.message || "Erro inesperado ao carregar histórico.")
    } finally {
      setListLoading(false)
    }
  }

  async function onSelectedFile(file: File | null) {
    if (!file) return

    if (!supabase) {
      showToast({ kind: "err", msg: "Configuração Supabase (pública) ausente. Verifique envs na Vercel." })
      return
    }

    const empresaId = getEmpresaId()
    if (!empresaId) {
      showToast({ kind: "err", msg: "Empresa não definida." })
      return
    }

    setBusy(true)
    try {
      // 1) create: cria registo e devolve signed upload url + token
      const r1 = await fetch("/api/admin/docs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-empresa-id": empresaId,
        },
        credentials: "include",
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type || null,
          size_bytes: file.size || null,

          // ✅ Bónus Moduz+: vincula ao módulo (ref_table="module:docs" no backend)
          module_key: "docs",
        }),
      })

      const j1 = (await r1.json().catch(() => null)) as CreateResp | null
      if (!r1.ok || !j1 || j1.ok !== true) {
        throw new Error((j1 as any)?.error || "Falha ao iniciar upload.")
      }

      // 2) upload ao signed url (não precisa policies)
      const { storage_bucket, storage_path } = j1.doc
      const { token } = j1.upload

      const up = await supabase.storage
        .from(storage_bucket)
        .uploadToSignedUrl(storage_path, token, file, { upsert: true })

      if (up.error) {
        throw new Error(`UPLOAD_FAILED: ${up.error.message}`)
      }

      // 3) complete: finaliza metadados + audit_log
      const r2 = await fetch("/api/admin/docs/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-empresa-id": empresaId,
        },
        credentials: "include",
        body: JSON.stringify({
          doc_id: j1.doc.id,
          filename: file.name,
          mime_type: file.type || null,
          size_bytes: file.size || null,
        }),
      })

      const j2 = (await r2.json().catch(() => null)) as CompleteResp | null
      if (!r2.ok || !j2 || j2.ok !== true) {
        throw new Error((j2 as any)?.error || "Falha ao finalizar upload.")
      }

      setLast({
        doc_id: j1.doc.id,
        filename: file.name,
        size_bytes: file.size,
        storage_bucket,
        storage_path,
        created_at: j1.doc.created_at,
      })

      showToast({ kind: "ok", msg: "Documento enviado com sucesso." })

      // refresh histórico
      loadList()
    } catch (e: any) {
      showToast({ kind: "err", msg: e?.message || "Erro inesperado no upload." })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  useEffect(() => {
    // primeira carga: tenta cache e depois valida via API
    loadList({ preferCache: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // ✅ Moduz+: quando muda a empresa, recarrega docs (cache primeiro)
    const onEmpresaChanged = () => loadList({ preferCache: true })
    window.addEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    return () => window.removeEventListener("moduz:empresa-changed", onEmpresaChanged as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // “Estado” (padrão Moduz): prioriza a sessão, mas cai para o histórico quando existe.
  const estado = useMemo(() => {
    if (last) {
      return {
        mode: "sessao" as const,
        filename: last.filename,
        size_bytes: last.size_bytes,
        created_at: last.created_at,
        doc_id: last.doc_id,
        storage_bucket: last.storage_bucket,
        storage_path: last.storage_path,
        uploaded_ok: true as boolean | null,
      }
    }

    const first = docs[0]
    if (first) {
      return {
        mode: "historico" as const,
        filename: first.filename ?? "sem nome",
        size_bytes: first.size_bytes ?? 0,
        created_at: first.created_at,
        doc_id: first.id,
        storage_bucket: first.storage_bucket,
        storage_path: first.storage_path,
        uploaded_ok: first.uploaded_ok ?? null,
      }
    }

    return null
  }, [last, docs])

  const resumo = useMemo(() => {
    const total = docs.length
    const hasStatus = docs.some((d) => typeof d.uploaded_ok === "boolean")
    if (!total || !hasStatus) return { total, ok: null as number | null, pendente: null as number | null }

    let ok = 0
    let pendente = 0
    for (const d of docs) {
      if (d.uploaded_ok === true) ok++
      if (d.uploaded_ok === false) pendente++
    }
    return { total, ok, pendente }
  }, [docs])

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Docs</h1>
          <p className="mt-2 text-sm text-slate-400">
            Repositório universal de documentos por empresa. Upload via Storage (Signed URL).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadList()}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
            title="Atualizar histórico"
          >
            Atualizar
          </button>

          <button
            onClick={onPickFile}
            disabled={busy || envMissing}
            className={[
              "rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900",
              busy || envMissing ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
            title={envMissing ? "Env pública Supabase ausente" : "Enviar ficheiro"}
          >
            {busy ? "A enviar…" : "Upload"}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => onSelectedFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {envMissing ? (
        <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/25 p-3">
          <p className="text-sm text-amber-200">
            Configuração Supabase (pública) ausente. Verifique na Vercel:
            <span className="font-mono"> NEXT_PUBLIC_SUPABASE_URL</span> e{" "}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>.
          </p>
        </div>
      ) : null}

      {/* Estado (Moduz+) */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-300">Estado</p>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            {resumo.total ? <span>Total: {resumo.total}</span> : <span>Sem documentos</span>}
            {resumo.ok != null && resumo.pendente != null ? (
              <>
                <span className="text-slate-600">•</span>
                <span>OK: {resumo.ok}</span>
                <span className="text-slate-600">•</span>
                <span>Pendentes: {resumo.pendente}</span>
              </>
            ) : null}
          </div>
        </div>

        {estado ? (
          <div className="mt-3 text-sm text-slate-400">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-slate-300">
                  {estado.mode === "sessao" ? "Último upload (sessão):" : "Último upload (histórico):"}
                </span>

                <span className="truncate">{estado.filename}</span>

                <span className="text-slate-500">({formatBytes(estado.size_bytes)})</span>

                <span
                  className={cls(
                    "ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                    estado.uploaded_ok === true && "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                    estado.uploaded_ok === false && "border-amber-900/60 bg-amber-950/30 text-amber-200",
                    estado.uploaded_ok == null && "border-slate-800 bg-slate-950 text-slate-400"
                  )}
                  title="Estado do upload (quando disponível)"
                >
                  {statusLabel(estado.uploaded_ok)}
                </span>
              </div>

              <div className="text-xs text-slate-500">{formatDt(estado.created_at)}</div>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                  Detalhes técnicos
                </summary>
                <div className="mt-2 space-y-1">
                  <div className="font-mono text-xs text-slate-500">doc_id: {estado.doc_id}</div>
                  <div className="font-mono text-xs text-slate-500">
                    {estado.storage_bucket}:{estado.storage_path}
                  </div>
                </div>
              </details>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Ainda não existem documentos nesta empresa. Clique em{" "}
            <span className="text-slate-200">Upload</span> para começar.
          </p>
        )}
      </div>

      {/* Histórico */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-300">Histórico (últimos 50)</p>
          {listLoading ? <span className="text-xs text-slate-500">a carregar…</span> : null}
        </div>

        {listErr ? (
          <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
            <p className="text-sm text-red-200">{listErr}</p>
          </div>
        ) : null}

        {!listErr && !listLoading && docs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Ainda não existem documentos para mostrar.</p>
        ) : null}

        {!listErr && docs.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {docs.map((d) => {
              const label = d.filename ?? "sem nome"
              const st = typeof d.uploaded_ok === "boolean" ? d.uploaded_ok : null

              return (
                <li key={d.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm text-slate-100 truncate">{label}</div>

                        <span
                          className={cls(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                            st === true && "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                            st === false && "border-amber-900/60 bg-amber-950/30 text-amber-200",
                            st == null && "border-slate-800 bg-slate-950 text-slate-400"
                          )}
                          title="Estado do upload (quando disponível)"
                        >
                          {statusLabel(st)}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {formatDt(d.created_at)} <span className="text-slate-600">•</span>{" "}
                        {d.size_bytes ? formatBytes(d.size_bytes) : "—"} <span className="text-slate-600">•</span>{" "}
                        {d.mime_type ?? "—"}
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                          Detalhes
                        </summary>
                        <div className="mt-2 space-y-1">
                          <div className="font-mono text-xs text-slate-500">doc_id: {d.id}</div>
                          <div className="font-mono text-xs text-slate-500">
                            {d.storage_bucket}:{d.storage_path}
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
