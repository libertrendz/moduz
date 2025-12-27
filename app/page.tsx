/**
 * =============================================
 * Moduz+ | App Entry
 * Arquivo: app/page.tsx
 * Módulo: Core
 * Etapa: Core Runtime
 * Descrição: Entrada da app. Redireciona fluxos de auth (recovery/otp) para rotas corretas.
 * =============================================
 */

"use client"

import { useEffect } from "react"

export default function HomePage() {
  useEffect(() => {
    // Se o link de recovery cair na raiz, redirecionamos para /auth/reset
    const href = window.location.href
    const search = window.location.search || ""
    const hash = window.location.hash || ""

    const isRecovery =
      search.includes("type=recovery") ||
      hash.includes("type=recovery") ||
      hash.includes("access_token=") ||
      search.includes("code=") // alguns fluxos usam ?code=

    if (isRecovery) {
      const target = `/auth/reset${search}${hash}`
      window.location.replace(target)
      return
    }

    // Se cair aqui, vai para login
    window.location.replace("/login")
  }, [])

  return (
    <main style={{ padding: 32 }}>
      <p>A redirecionar…</p>
    </main>
  )
}
