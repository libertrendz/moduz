/**
 * =============================================
 * Moduz+ | Logout Route
 * Arquivo: app/auth/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Logout SSR (v1.2)
 * Descrição:
 *  - Encerra sessão Supabase (cookies)
 *  - Suporta GET e POST (evita 405)
 *  - Redireciona para /login
 * =============================================
 */

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function supabaseServer() {
  const cookieStore = cookies()

  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 })
      },
    },
  })
}

async function handler() {
  try {
    const supabase = supabaseServer()
    await supabase.auth.signOut()
  } catch {
    // mesmo se falhar, seguimos com redirect (não travar logout)
  }

  const url = new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
  return NextResponse.redirect(url)
}

export async function GET() {
  return handler()
}

export async function POST() {
  return handler()
}
