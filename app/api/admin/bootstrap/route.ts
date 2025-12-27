/**
 * =============================================
 * Moduz+ | API Admin (Service Role)
 * Arquivo: app/api/admin/bootstrap/route.ts
 * Módulo: Core
 * Etapa: Segurança (pós-bootstrap)
 * Descrição: Endpoint de bootstrap DESATIVADO após setup inicial.
 * Motivo: reduzir superfície de ataque e manter repo limpo.
 * =============================================
 */

import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "bootstrap_disabled",
      message:
        "Bootstrap já foi concluído neste projeto. Endpoint desativado permanentemente.",
    },
    { status: 410 }
  )
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "bootstrap_disabled",
      message:
        "Bootstrap já foi concluído neste projeto. Endpoint desativado permanentemente.",
    },
    { status: 410 }
  )
}
