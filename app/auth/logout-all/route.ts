/**
 * =============================================
 * Moduz+ | Logout All Route
 * Arquivo: app/auth/logout-all/route.ts
 * Módulo: Core (Auth)
 * Etapa: Logout SSR (v1.0 - global)
 * Descrição:
 *  - Encerra sessão Supabase (cookies) e revoga TODAS as sessões do utilizador
 *  - Suporta GET e POST
 *  - Redireciona para /login usando a origin do request
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

async function handler(req: Request) {
  try {
    const supabase = supabaseServer()
    await supabase.auth.signOut({ scope: "global" })
  } catch {
    // segue
  }

  const origin = new URL(req.url).origin
  return NextResponse.redirect(new URL("/login", origin))
}

export async function GET(req: Request) {
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}
