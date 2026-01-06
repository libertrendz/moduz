/**
 * =============================================
 * Moduz+ | Docs
 * Arquivo: app/adm/docs/page.tsx
 * Módulo: Docs
 * Etapa: MVP Upload (v1.0.1)
 * Descrição:
 *  - Upload via Signed Upload URL (server-side) -> não depende de policies no bucket
 *  - Cria registo em public.docs + finaliza metadados + audit_log
 *  - Hard rule Moduz: não explodir UI por ENV ausente (mostrar erro controlado)
 * =============================================
 */

"use client"

import { useMemo, useRef, useState } from "react"
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

  async function onPickFile() {
    inputRef.current?.click()
  }

  async function onSelectedFile(file: File | null) {
    if (!file) return

    if (!supabase) {
      showToast({ kind: "err", msg: "Configuração Supabase (public) ausente. Verifique envs na Vercel." })
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
    } catch (e: any) {
      showToast({ kind: "err", msg: e?.message || "Erro inesperado no upload." })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const envMissing = !supabaseUrl || !supabaseAnonKey

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Docs</h1>
          <p className="mt-2 text-sm text-slate-400">
            Repositório universal de documentos por empresa. Upload via Storage (Signed URL).
          </p>
        </div>

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

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-sm text-slate-300">Estado</p>

        {last ? (
          <div className="mt-3 text-sm text-slate-400">
            <div className="flex flex-col gap-1">
              <div>
                <span className="text-slate-300">Último upload:</span> {last.filename}{" "}
                <span className="text-slate-500">({formatBytes(last.size_bytes)})</span>
              </div>
              <div className="font-mono text-xs text-slate-500">doc_id: {last.doc_id}</div>
              <div className="font-mono text-xs text-slate-500">
                {last.storage_bucket}:{last.storage_path}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Ainda não há uploads nesta sessão. Clique em <span className="text-slate-200">Upload</span>.
          </p>
        )}
      </div>
    </div>
  )
}
