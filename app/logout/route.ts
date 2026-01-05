/**
 * =============================================
 * Moduz+ | Logout Alias
 * Arquivo: app/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Compat (v1)
 * Descrição:
 *  - Alias histórico /logout
 *  - Redirecciona para /auth/logout
 * =============================================
 */

import { NextResponse } from "next/server"

function redirect(req: Request) {
  const origin = new URL(req.url).origin
  return NextResponse.redirect(new URL("/auth/logout", origin))
}

export async function GET(req: Request) {
  return redirect(req)
}

export async function POST(req: Request) {
  return redirect(req)
}
