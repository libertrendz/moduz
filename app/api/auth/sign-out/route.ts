/**
 * =============================================
 * Moduz+ | Auth Sign-Out (SSR Cookies)
 * Arquivo: app/api/auth/sign-out/route.ts
 * Módulo: Core (Auth)
 * Etapa: Logout SSR cookie (v1)
 * Descrição:
 *  - Encerra sessão Supabase
 *  - Remove cookies SSR
 * =============================================
 */

import { NextResponse } from "next/server"
import { supabaseServer } from "../../../../lib/supabase/server"

export async function POST() {
  try {
    const supabase = supabaseServer()
    await supabase.auth.signOut()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNEXPECTED", details: e?.message ?? null },
      { status: 500 }
    )
  }
}
