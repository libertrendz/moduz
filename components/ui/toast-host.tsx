/**
 * =============================================
 * Moduz+ | Toast Host
 * Arquivo: components/ui/toast-host.tsx
 * Etapa: UI Infra (Overlay)
 * Descrição:
 *  - Renderiza toast global
 *  - Posição fixa (não empurra layout)
 *  - Auto-dismiss
 * =============================================
 */

"use client"

import * as React from "react"
import { useToast } from "./toast-context"

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ")
}

export function ToastHost() {
  const { toast, clearToast } = useToast()

  React.useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => clearToast(), 2800)
    return () => window.clearTimeout(t)
  }, [toast, clearToast])

  if (!toast) return null

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div
        className={classNames(
          "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
          toast.kind === "ok" &&
            "border-emerald-900/60 bg-emerald-950/90 text-emerald-200",
          toast.kind === "err" &&
            "border-red-900/60 bg-red-950/90 text-red-200",
          toast.kind === "info" &&
            "border-slate-800 bg-slate-950/90 text-slate-200"
        )}
      >
        {toast.msg}
      </div>
    </div>
  )
}
