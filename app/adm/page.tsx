/**
 * =============================================
 * Moduz+ | Admin Home
 * Arquivo: app/adm/page.tsx
 * Módulo: Core
 * Etapa: Guard SSR + contexto (v4 - UI limpa)
 * Descrição:
 *  - Exige sessão SSR (cookies) e evita loop no mobile
 *  - Busca contexto via /api/admin/core/context (credentials: include)
 *  - Mostra email, display_name, role e nome da empresa ativa
 *  - Logout via /api/auth/sign-out (server) para limpar cookies SSR
 *  - UI: remove texto técnico de debug (endpoints)
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"

type EmpresaItem = {
  empresa_id: string
  nome: string | null
  role: string | null
  ativo: boolean
}

type CoreContextOk = {
  ok: true
  user: { id: string; email: string | null }
  profile: {
    profile_id: string | null
    display_name: string | null
    role: string | null
    empresa_id: string | null
  } | null
  empresas: EmpresaItem[]
  default_empresa_id: string | null
}

type CoreContextErr = { ok: false; error: string; details?: string | null }
type CoreContextResponse = CoreContextOk | CoreContextErr

function getEmpresaIdFromStorage(): string | null {
  try {
    const v = window.localStorage.getItem("moduz_empresa_id")
    return v && v.length > 10 ? v : null
  } catch {
    return null
  }
}

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
        const res = await fetch("/api/admin/core/context", {
          method: "GET",
          credentials: "include",
        })

        if (res.status === 401 || res.status === 403) {
          window.location.replace("/login")
          return
        }

        const json = (await res.json().catch(() => null)) as CoreContextResponse | null

        if (!res.ok || !json || json.ok === false) {
          if (!cancelled) {
            setErr((json as any)?.error || "Falha ao carregar contexto.")
            setData(null)
          }
          return
        }

        if (!cancelled) setData(json as CoreContextOk)
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

  const activeEmpresaId = useMemo(() => {
    return (
      getEmpresaIdFromStorage() ||
      data?.default_empresa_id ||
      data?.empresas?.[0]?.empresa_id ||
      null
    )
  }, [data])

  const activeEmpresa = useMemo(() => {
    if (!data || !activeEmpresaId) return null
    return data.empresas.find((e) => e.empresa_id === activeEmpresaId) ?? null
  }, [data, activeEmpresaId])

  const onLogout = async () => {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // ignore
    } finally {
      window.location.replace("/login")
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-50">Admin • Moduz+</h1>
              <p className="mt-2 text-sm text-slate-400">
                Gestão do Core, módulos e acesso. Configure a empresa ativa e avance por camadas.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href="/adm/core/modulos"
                  className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-800"
                >
                  Gestão de Módulos
                </a>
                <a
                  href="/adm"
                  className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-900"
                >
                  Atualizar
                </a>
              </div>
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
                  {data?.user?.email ?? data?.user?.id ?? "—"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {data?.profile?.display_name ?? "—"} • {data?.profile?.role ?? "—"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm font-medium text-slate-200">Empresa ativa</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {activeEmpresa?.nome ?? "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeEmpresaId ?? "sem empresa ativa"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:col-span-2">
                <h2 className="text-sm font-medium text-slate-200">Empresas</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {(data?.empresas ?? [])
                    .map((e) => e.nome ?? e.empresa_id)
                    .join(", ") || "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
