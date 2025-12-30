/**
 * =============================================
 * Moduz+ | Auth API
 * Arquivo: app/api/auth/login/route.ts
 * Módulo: Core (Auth)
 * Etapa: SSR Cookie Login (v1)
 * Descrição:
 *  - Login server-side com email + palavra-passe
 *  - Persiste sessão em cookies HttpOnly (sb-*)
 *  - Base para autenticação SSR em /api/admin/**
 * =============================================
 */

import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function sanitizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase()
}

function sanitizePassword(v: unknown): string {
  // não dar trim: password pode conter espaços
  return String(v ?? "")
}

export async function POST(req: NextRequest) {
  let res = NextResponse.json({ ok: true }, { status: 200 })

  const body = await req.json().catch(() => null)
  const email = sanitizeEmail(body?.email)
  const password = sanitizePassword(body?.password)

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "MISSING_CREDENTIALS" }, { status: 400 })
  }

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

  return res
}
