/**
 * =============================================
 * Moduz+ | Login
 * Arquivo: app/login/page.tsx
 * Módulo: Core (Auth)
 * Etapa: Login SSR cookie (v2)
 * Descrição:
 *  - Login via /api/auth/sign-in (SSR cookies)
 *  - Evita loop/pisca-pisca no mobile (client session vs cookie session)
 *  - Se já estiver autenticado, redireciona para /adm
 * =============================================
 */

"use client"

import { useEffect, useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    // Se já houver sessão SSR (cookies), entra direto.
    ;(async () => {
      try {
        const r = await fetch("/api/admin/core/context", { credentials: "include" })
        if (r.ok) {
          window.location.replace("/adm")
          return
        }
      } catch {
        // ignore
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    try {
      const r = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      const j = await r.json().catch(() => ({}))

      if (!r.ok || !j?.ok) {
        setMsg(j?.details || "Credenciais inválidas.")
        return
      }

      // sessão SSR cookie foi setada → entra no admin
      window.location.replace("/adm")
    } catch (err: any) {
      setMsg(err?.message || "Erro inesperado no login.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-black text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
        <div className="flex items-center gap-3">
          <img
            src="/brand/moduzplus-wordmark-ret.png"
            alt="Moduz+"
            className="h-10 w-auto"
          />
        </div>

        <h1 className="mt-4 text-xl font-semibold text-slate-50">Entrar</h1>
        <p className="mt-2 text-sm text-slate-400">
          Aceda com o seu email e palavra-passe.
        </p>

        {checking ? (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-sm text-slate-300">A verificar sessão…</p>
          </div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
            <p className="text-sm text-red-200">{msg}</p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm text-slate-300">Email</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-slate-600"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@empresa.com"
              autoComplete="email"
              required
              disabled={loading}
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">Palavra-passe</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-slate-600"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
              required
              disabled={loading}
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
