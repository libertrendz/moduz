/**
 * =============================================
 * Moduz+ | Logout Alias
 * Arquivo: app/logout/route.ts
 * Módulo: Core (Auth)
 * Etapa: Alias (v1)
 * Descrição:
 *  - Compatibilidade: /logout → /auth/logout
 *  - Evita 405 quando algum link antigo apontar para /logout
 * =============================================
 */

import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const url = new URL("/auth/logout", req.url)
  return NextResponse.redirect(url)
}

export async function POST(req: Request) {
  const url = new URL("/auth/logout", req.url)
  return NextResponse.redirect(url)
}
