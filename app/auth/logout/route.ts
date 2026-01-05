/**
 * =============================================
 * Moduz+ | Logout Route
 * Arquivo: app/auth/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Logout SSR (v1.3.1)
 * Descrição:
 *  - Encerra sessão Supabase (cookies) APENAS neste dispositivo (scope local)
 *  - Suporta GET e POST
 *  - Redireciona para /login usando a origin do request (sem localhost)
 * Risco mitigado:
 *  - Evita “logout no mobile derrubar sessão no desktop” (revogação global)
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
  const cookieStore = cookies()

  try {
    const supabase = supabaseServer()

    // ✅ Logout apenas local (não revoga sessões noutros dispositivos)
    await supabase.auth.signOut({ scope: "local" })
  } catch {
    // Mesmo se falhar, seguimos com redirect (não travar logout)
  }

  // ✅ Limpeza defensiva dos cookies locais do Supabase neste device
  // (não afeta outros dispositivos; apenas o browser atual)
  try {
    const all = cookieStore.getAll()
    for (const c of all) {
      if (c.name.startsWith("sb-")) {
        cookieStore.set({ name: c.name, value: "", path: "/", maxAge: 0 })
      }
    }
  } catch {
    // ignore
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
