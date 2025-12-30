/**
 * =============================================
 * Moduz+ | Admin Layout
 * Arquivo: app/adm/layout.tsx
 * Módulo: Core (Admin)
 * Etapa: Shell com switcher e menu dinâmico (v1)
 * =============================================
 */

import type { ReactNode } from "react"
import { AdmShell } from "../../components/adm/adm-shell"

export default function AdmLayout({ children }: { children: ReactNode }) {
  return <AdmShell>{children}</AdmShell>
}
