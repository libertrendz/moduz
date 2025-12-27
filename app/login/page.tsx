/**
 * =============================================
 * Moduz+ | Login
 * Arquivo: app/login/page.tsx
 * Módulo: Core (Auth)
 * Etapa: Login simples (v1)
 * Descrição: Login por email + palavra-passe. Redireciona para /adm.
 * =============================================
 */

"use client"

import { useEffect, useState } from "react"
import { supabaseBrowser } from "../lib/supabase-browser"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    // Se já tiver sessão, manda para /adm
    ;(async () => {
      try {
        const supabase = supabaseBrowser()
        const { data } = await supabase.auth.getSession()
        if (data.session) window.location.replace("/adm")
      } catch {
        // ignore
      }
    })()
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    try {
      const supabase = supabaseBrowser()

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setMsg(error.message)
        return
      }

      const token = data.session?.access_token
      if (!token) {
        setMsg("Sessão inválida. Tente novamente.")
        return
      }

      // valida contexto do Core
      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok || !json?.ok) {
        setMsg(
          "Login concluído, mas não foi possível carregar o contexto do Core (sem profile?)."
        )
        return
      }

      // ok → entra no admin
      window.location.replace("/adm")
    } catch (err: any) {
      setMsg(err?.message || "Erro inesperado no login.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-xl font-semibold text-slate-50">Entrar no Moduz+</h1>
        <p className="mt-2 text-sm text-slate-400">
          Aceda com o seu email e palavra-passe.
        </p>

        {msg ? (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
            <p className="text-sm text-red-200">{msg}</p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-300">Email</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@empresa.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">Palavra-passe</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "A entrar…" : "Entrar"}
          </button>

          <div className="pt-2 text-xs text-slate-500">
            <a className="underline" href="/auth/reset">
              Esqueci a palavra-passe
            </a>
          </div>
        </form>
      </div>
    </main>
  )
}
