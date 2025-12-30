/**
 * =============================================
 * Moduz+ | Admin Layout
 * Arquivo: app/adm/layout.tsx
 * Módulo: Core (Admin)
 * Etapa: Shell + Menu dinâmico (v1)
 * Descrição:
 *  - Layout do /adm (nested)
 *  - NÃO importa globals.css aqui (deve ficar no app/layout.tsx)
 *  - Envolve páginas admin com AdmShell
 * =============================================
 */

import type { ReactNode } from "react"
import { AdmShell } from "../../components/adm/adm-shell"

export default function AdmLayout({ children }: { children: ReactNode }) {
  return <AdmShell>{children}</AdmShell>
}
