/**
 * =============================================
 * Moduz+ | Logout Route
 * Arquivo: app/auth/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Logout SSR (v1.4 - local/global)
 * Descrição:
 *  - Logout por cookies (SSR)
 *  - Por defeito: LOCAL (não derruba outras sessões)
 *  - Opcional: GLOBAL com ?all=1
 *  - Redirecciona para /login usando a origin do request (sem localhost)
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
  const url = new URL(req.url)
  const origin = url.origin

  // por defeito: LOCAL (não afecta outras sessões)
  const all = url.searchParams.get("all") === "1"
  const scope = all ? ("global" as const) : ("local" as const)

  try {
    const supabase = supabaseServer()
    // IMPORTANTE: scope explícito
    await supabase.auth.signOut({ scope })
  } catch {
    // Mesmo se falhar, seguimos com redirect (não travar logout)
  }

  return NextResponse.redirect(new URL("/login", origin))
}

export async function GET(req: Request) {
  return handler(req)
}

export async function POST(req: Request) {
  return handler(req)
}
