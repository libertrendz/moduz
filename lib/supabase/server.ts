/**
 * =============================================
 * Moduz+ | Supabase Server (SSR Cookies)
 * Arquivo: lib/supabase/server.ts
 * Módulo: Core (Auth)
 * Etapa: SSR session via cookies (v2 - compat)
 * Descrição:
 *  - Cliente Supabase server-side com persistência via cookies (Next App Router)
 *  - Compatível com imports existentes: createSupabaseServerClient()
 *  - Evita loops mobile (client session vs cookie session)
 * =============================================
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function requiredEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

/**
 * Nome "canônico" compatível com o código existente no repo.
 * Use este nas rotas server-side.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anon = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }))
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          cookieStore.set({
            name: c.name,
            value: c.value,
            ...c.options,
          })
        }
      },
    },
  })
}

/**
 * Alias opcional (para legibilidade).
 * Mantém o contrato de compatibilidade com createSupabaseServerClient.
 */
export function supabaseServer() {
  return createSupabaseServerClient()
}
