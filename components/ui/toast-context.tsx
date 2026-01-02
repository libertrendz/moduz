/**
 * =============================================
 * Moduz+ | Toast Context
 * Arquivo: components/ui/toast-context.tsx
 * Etapa: UI Infra (Global)
 * Descrição:
 *  - Contexto global para mensagens toast
 *  - Evita duplicação de lógica nas páginas
 * =============================================
 */

"use client"

import * as React from "react"

export type ToastKind = "ok" | "err" | "info"

export type ToastPayload = {
  kind: ToastKind
  msg: string
}

type ToastContextValue = {
  toast: ToastPayload | null
  showToast: (t: ToastPayload) => void
  clearToast: () => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider(props: { children: React.ReactNode }) {
  const { children } = props
  const [toast, setToast] = React.useState<ToastPayload | null>(null)

  function showToast(t: ToastPayload) {
    setToast(t)
  }

  function clearToast() {
    setToast(null)
  }

  return (
    <ToastContext.Provider value={{ toast, showToast, clearToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>")
  }
  return ctx
}
