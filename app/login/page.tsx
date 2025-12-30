/**
 * =============================================
 * Moduz+ | Login
 * Arquivo: app/login/page.tsx
 * Módulo: Core (Auth)
 * Etapa: Login SSR Cookie (v2)
 * Descrição:
 *  - Login por email + palavra-passe via API server-side (/api/auth/login)
 *  - Sessão persistida em cookies (SSR), compatível com /api/admin/**
 *  - Valida sessão via /api/health/whoami e redireciona para /adm
 * =============================================
 */

"use client"

import { useEffect, useState } from "react"

type WhoAmI = {
  ok: boolean
  authed: boolean
  user_id: string | null
  auth_error: string | null
  cookie_names: string[]
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function fetchWhoAmI(): Promise<WhoAmI | null> {
    try {
      const r = await fetch("/api/health/whoami", { credentials: "include" })
      if (!r.ok) return null
      return (await r.json()) as WhoAmI
    } catch {
      return null
    }
  }

  useEffect(() => {
    // Se já tiver sessão SSR (cookie), manda para /adm
    ;(async () => {
      const who = await fetchWhoAmI()
      if (who?.authed) window.location.replace("/adm")
    })()
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    // sanitização mínima (contrato)
    const safeEmail = email.trim().toLowerCase()
    const safePassword = password // não trim (password pode conter espaços)

    if (!safeEmail || !safePassword) {
      setMsg("Preencha email e palavra-passe.")
      setLoading(false)
      return
    }

    try {
      // Login server-side: grava cookies sb-* no response
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: safeEmail, password: safePassword }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "Credenciais inválidas ou erro no login.")
        return
      }

      // Valida que a sessão SSR realmente existe (evita falso positivo)
      const who = await fetchWhoAmI()
      if (!who?.authed) {
        setMsg(
          "Login concluído, mas a sessão SSR não foi criada (cookies ausentes). Verifique o domínio/HTTPS e tente novamente."
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
