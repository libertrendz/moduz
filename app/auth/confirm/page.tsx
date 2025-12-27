/**
 * =============================================
 * Moduz+ | UI App
 * Arquivo: app/auth/confirm/page.tsx
 * Módulo: Core (Auth)
 * Etapa: MVP Técnico – Bootstrap Auth UI
 * Descrição: Endpoint de retorno do Supabase (magic link/PKCE/OTP).
 * Nota: lógica real será implementada na etapa de Auth do Core.
 * =============================================
 */

export default function AuthConfirmPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-xl font-semibold text-slate-50">A validar acesso…</h1>
        <p className="mt-2 text-sm text-slate-400">
          Estamos a concluir a autenticação. Se esta página não avançar em alguns
          segundos, volte e tente novamente.
        </p>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-300">
            Bootstrap inicial. A lógica de exchange de sessão será adicionada quando
            iniciarmos o Core/Auth.
          </p>
        </div>
      </div>
    </main>
  )
}
