/**
 * =============================================
 * Moduz+ | UI App
 * Arquivo: app/auth/reset/page.tsx
 * Módulo: Core (Auth)
 * Etapa: Core Runtime
 * Descrição: Finaliza reset de palavra-passe (recovery). Captura token e permite definir nova senha.
 * =============================================
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@supabase/supabase-js"

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function parseHashParams(hash: string): Record<string, string> {
  const h = hash.startsWith("#") ? hash.slice(1) : hash
  const params = new URLSearchParams(h)
  const obj: Record<string, string> = {}
  params.forEach((value, key) => {
    obj[key] = value
  })
  return obj
}

export default function AuthResetPage() {
  const supabase = useMemo(() => {
    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL")
    // atenção: no Supabase novo, essa env pode conter a publishable key (sb_publishable_...)
    // mas mantemos o nome para não mexer no resto do projeto.
    const anon = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    return createClient(url, anon)
  }, [])

  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const run = async () => {
      setError(null)

      // Fluxo A: link com hash (#access_token=...&refresh_token=...&type=recovery)
      const hash = window.location.hash || ""
      const hp = parseHashParams(hash)
      const access_token = hp["access_token"]
      const refresh_token = hp["refresh_token"]

      try {
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (setErr) throw setErr
        } else {
          // Fluxo B: link com ?code=... (PKCE / novos fluxos)
          // Se houver code no query, tentamos exchange
          const url = new URL(window.location.href)
          const code = url.searchParams.get("code")
          if (code) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(
              window.location.href
            )
            if (exErr) throw exErr
          }
        }

        const { data } = await supabase.auth.getSession()
        setHasSession(!!data.session)
        setReady(true)

        if (!data.session) {
          setError(
            "Não foi possível validar o link de recuperação. Peça um novo link de reset."
          )
        }
      } catch (e: any) {
        setReady(true)
        setHasSession(false)
        setError(e?.message || "Falha ao validar o link de recuperação.")
      }
    }

    run()
  }, [supabase])

  const onSave = async () => {
    setError(null)
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.")
      return
    }
    if (password !== password2) {
      setError("As palavras-passe não coincidem.")
      return
    }

    setSaving(true)
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password })
      if (upErr) throw upErr

      setDone(true)

      // opcional: terminar sessão e mandar para login
      await supabase.auth.signOut()
      setTimeout(() => {
        window.location.replace("/login")
      }, 800)
    } catch (e: any) {
      setError(e?.message || "Erro ao definir nova palavra-passe.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-xl font-semibold text-slate-50">Redefinir palavra-passe</h1>
        <p className="mt-2 text-sm text-slate-400">
          Defina uma nova palavra-passe para concluir o processo.
        </p>

        {!ready ? (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-300">A validar link…</p>
          </div>
        ) : !hasSession ? (
          <div className="mt-6 rounded-lg border border-red-900/60 bg-red-950/30 p-4">
            <p className="text-sm text-red-200">{error ?? "Sessão inválida."}</p>
          </div>
        ) : done ? (
          <div className="mt-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-4">
            <p className="text-sm text-emerald-200">
              Palavra-passe atualizada. A redirecionar para o login…
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {error ? (
              <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            ) : null}

            <label className="block">
              <span className="text-sm text-slate-300">Nova palavra-passe</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Confirmar palavra-passe</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="********"
              />
            </label>

            <button
              className="w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 disabled:opacity-50"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "A guardar…" : "Guardar nova palavra-passe"}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
