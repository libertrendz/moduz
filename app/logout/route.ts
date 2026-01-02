/**
 * =============================================
 * Moduz+ | Logout Alias
 * Arquivo: app/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Alias (v1.1)
 * Descrição:
 *  - Compatibilidade: /logout → /auth/logout
 *  - Usa origin do request (sem localhost)
 * =============================================
 */

import { NextResponse } from "next/server"

function redirectToAuthLogout(req: Request) {
  const origin = new URL(req.url).origin
  return NextResponse.redirect(new URL("/auth/logout", origin))
}

export async function GET(req: Request) {
  return redirectToAuthLogout(req)
}

export async function POST(req: Request) {
  return redirectToAuthLogout(req)
}
