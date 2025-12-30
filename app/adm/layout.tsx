/**
 * =============================================
 * Moduz+ | Admin Root Layout
 * Arquivo: app/adm/layout.tsx
 * Módulo: Core (Admin)
 * Etapa: Shell + CSS global (v1)
 * Descrição:
 *  - Root layout do /adm com <html>/<body>
 *  - Importa globals.css (Tailwind)
 *  - Envolve todas as páginas admin com AdmShell
 * =============================================
 */

import type { ReactNode } from "react"
import "../globals.css"
import { AdmShell } from "../../components/adm/adm-shell"

export const metadata = {
  title: "Moduz+ | Admin",
  description: "Admin do Moduz+",
}

export default function AdmRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        <AdmShell>{children}</AdmShell>
      </body>
    </html>
  )
}
