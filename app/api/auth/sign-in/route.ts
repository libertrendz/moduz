/**
 * =============================================
 * Moduz+ | Auth Sign-In (SSR Cookies)
 * Arquivo: app/api/auth/sign-in/route.ts
 * Módulo: Core (Auth)
 * Etapa: Login SSR cookie (v1)
 * Descrição:
 *  - Faz login com email+password
 *  - Persiste sessão via cookies httpOnly (Supabase SSR)
 * =============================================
 */

import { NextResponse } from "next/server"
import { supabaseServer } from "../../../../lib/supabase/server"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const email = String(body?.email ?? "").trim()
    const password = String(body?.password ?? "")

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "MISSING_CREDENTIALS" }, { status: 400 })
    }

    const supabase = supabaseServer()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data?.session) {
      return NextResponse.json(
        { ok: false, error: "INVALID_LOGIN", details: error?.message ?? null },
        { status: 401 }
      )
    }

    // Cookie já é setado via @supabase/ssr (setAll) durante o signIn
    return NextResponse.json({
      ok: true,
      user_id: data.user?.id ?? null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNEXPECTED", details: e?.message ?? null },
      { status: 500 }
    )
  }
}
