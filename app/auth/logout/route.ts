/**
 * =============================================
 * Moduz+ | Logout Route
 * Arquivo: app/auth/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Logout SSR (v1.3)
 * Descrição:
 *  - Encerra sessão Supabase (cookies)
 *  - Suporta GET e POST
 *  - Redireciona para /login usando a origin do request (sem localhost)
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
    await supabase.auth.signOut()
  } catch {
    // Mesmo se falhar, seguimos com redirect (não travar logout)
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
