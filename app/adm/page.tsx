/**
 * =============================================
 * Moduz+ | Admin Home
 * Arquivo: app/adm/page.tsx
 * Módulo: Core
 * Etapa: Guard mínimo + contexto
 * Descrição: Exige sessão. Busca /api/admin/me e mostra contexto.
 * =============================================
 */

"use client"

import { useEffect, useState } from "react"
import { supabaseBrowser } from "../lib/supabase-browser"

type MeResponse = {
  ok: boolean
  user?: { id: string; email?: string }
  empresas?: Array<{ id: string; nome: string; slug?: string | null }>
  active_empresa_id?: string | null
  profile?: { role: string; display_name?: string | null } | null
  modules_enabled?: string[]
  settings?: any
  error?: string
}

export default function AdmHomePage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MeResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setErr(null)
      setLoading(true)

      try {
        const supabase = supabaseBrowser()
        const { data: sess } = await supabase.auth.getSession()

        if (!sess.session) {
          window.location.replace("/login")
          return
        }

        const token = sess.session.access_token

        const res = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = (await res.json().catch(() => ({}))) as MeResponse

        if (!res.ok || !json?.ok) {
          setErr(json?.error || "Falha ao carregar contexto do Core.")
          setData(json)
          return
        }

        setData(json)
      } catch (e: any) {
        setErr(e?.message || "Erro inesperado.")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const onLogout = async () => {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    window.location.replace("/login")
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-50">Admin • Moduz+</h1>
              <p className="mt-2 text-sm text-slate-400">
                Core runtime (contexto via <code className="text-slate-200">/api/admin/me</code>).
              </p>
            </div>

            <button
              onClick={onLogout}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              Sair
            </button>
          </div>

          {loading ? (
            <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-sm text-slate-300">A carregar…</p>
            </div>
          ) : err ? (
            <div className="mt-6 rounded-lg border border-red-900/60 bg-red-950/30 p-4">
              <p className="text-sm text-red-200">{err}</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm font-medium text-slate-200">Utilizador</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {data?.user?.email ?? data?.user?.id}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {data?.profile?.display_name ?? "—"} • {data?.profile?.role ?? "—"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm font-medium text-slate-200">Empresa ativa</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {data?.empresas?.find((e) => e.id === data?.active_empresa_id)?.nome ??
                    "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {data?.active_empresa_id ?? "sem empresa ativa"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:col-span-2">
                <h2 className="text-sm font-medium text-slate-200">Módulos ativos</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {(data?.modules_enabled ?? []).join(", ") || "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
