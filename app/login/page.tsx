/**
 * =============================================
 * Moduz+ | Login
 * Arquivo: app/login/page.tsx
 * Módulo: Core (Auth)
 * Etapa: Login SSR via /api/auth/login (v2.1)
 * Descrição:
 *  - Envia email + palavra-passe para /api/auth/login (server-side)
 *  - Cookies SSR são escritos no response (sb-...-auth-token)
 *  - Redirecciona para /adm
 * =============================================
 */

"use client"

import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const j = await r.json().catch(() => ({} as any))

      if (!r.ok || !j?.ok) {
        const details = j?.details ? `: ${j.details}` : ""
        setMsg(j?.error ? `${j.error}${details}` : "Falha no login.")
        return
      }

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
        <p className="mt-2 text-sm text-slate-400">Aceda com o seu email e palavra-passe.</p>

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
