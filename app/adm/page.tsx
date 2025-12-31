/**
 * =============================================
 * Moduz+ | Admin Home
 * Arquivo: app/adm/page.tsx
 * Módulo: Core
 * Etapa: Guard SSR + contexto (v2)
 * Descrição:
 *  - Exige sessão SSR (cookies) e evita loop no mobile
 *  - Busca contexto via /api/admin/core/context (credentials: include)
 *  - Logout via /api/auth/sign-out (server) para limpar cookies SSR
 * =============================================
 */

"use client"

import { useEffect, useState } from "react"

type EmpresaItem = {
  empresa_id: string
  nome: string
  role?: string | null
}

type CoreContextOk = {
  ok: true
  user_id: string
  email?: string | null
  profile?: {
    profile_id?: string | null
    display_name?: string | null
    role?: string | null
    empresa_id?: string | null
  } | null
  empresas: EmpresaItem[]
  default_empresa_id: string | null
}

type CoreContextErr = { ok: false; error: string; details?: string | null }

type CoreContextResponse = CoreContextOk | CoreContextErr

export default function AdmHomePage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CoreContextOk | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setErr(null)
      setLoading(true)

      try {
        // Guard SSR: se não houver cookies válidos, o server responde 401
        const res = await fetch("/api/admin/core/context", {
          method: "GET",
          credentials: "include",
        })

        if (res.status === 401 || res.status === 403) {
          // Sem sessão SSR → vai para login (sem loop)
          window.location.replace("/login")
          return
        }

        const json = (await res.json().catch(() => null)) as CoreContextResponse | null

        if (!res.ok || !json || json.ok === false) {
          const msg =
            (json as any)?.error ||
            "Falha ao carregar contexto do Core (SSR)."
          if (!cancelled) {
            setErr(msg)
            setData(null)
          }
          return
        }

        if (!cancelled) {
          setData(json as CoreContextOk)
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Erro inesperado.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const onLogout = async () => {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // mesmo se falhar, forçamos saída
    } finally {
      window.location.replace("/login")
    }
  }

  const activeEmpresaId =
    (typeof window !== "undefined" && window.localStorage?.getItem("moduz_empresa_id")) ||
    data?.default_empresa_id ||
    data?.empresas?.[0]?.empresa_id ||
    null

  const activeEmpresaName =
    data?.empresas?.find((e) => e.empresa_id === activeEmpresaId)?.nome ?? "—"

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-50">Admin • Moduz+</h1>
              <p className="mt-2 text-sm text-slate-400">
                Core runtime (contexto via{" "}
                <code className="text-slate-200">/api/admin/core/context</code>).
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
                  {data?.email ?? data?.user_id ?? "—"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {data?.profile?.display_name ?? "—"} • {data?.profile?.role ?? "—"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm font-medium text-slate-200">Empresa ativa</h2>
                <p className="mt-2 text-sm text-slate-400">{activeEmpresaName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeEmpresaId ?? "sem empresa ativa"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:col-span-2">
                <h2 className="text-sm font-medium text-slate-200">Empresas</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {(data?.empresas ?? []).map((e) => e.nome).join(", ") || "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
