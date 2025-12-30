/**
 * =============================================
 * Moduz+ | Health
 * Arquivo: app/api/health/login-debug/route.ts
 * Módulo: Core (Auth)
 * Etapa: Diagnóstico de Set-Cookie (v1)
 * Descrição:
 *  - Faz signIn server-side e retorna quantos cookies foram setados na resposta.
 *  - NÃO retorna tokens.
 * =============================================
 */

import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = String(body?.email ?? "").trim().toLowerCase()
  const password = String(body?.password ?? "")

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "MISSING_CREDENTIALS" }, { status: 400 })
  }

  let res = NextResponse.json({ ok: true }, { status: 200 })

  const supabase = createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        res.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        res.cookies.set({ name, value: "", ...options, maxAge: 0 })
      },
    },
  })

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 })
  }

  // ✅ quantos cookies o NextResponse está tentando setar
  const setCookies = res.cookies.getAll().map((c) => c.name)

  return NextResponse.json(
    { ok: true, set_cookie_names: setCookies, set_cookie_count: setCookies.length },
    { status: 200 }
  )
}
