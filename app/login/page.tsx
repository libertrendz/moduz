/**
 * =============================================
 * Moduz+ | UI App
 * Arquivo: app/login/page.tsx
 * Módulo: Core (Auth)
 * Etapa: MVP Técnico – Bootstrap Auth UI
 * Descrição: Entrada comum da aplicação (login com senha + opção OTP futura).
 * =============================================
 */

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-slate-50">Entrar no Moduz+</h1>
          <p className="text-sm text-slate-400">
            Aceda à sua conta para gerir a sua empresa.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-300">
              Bootstrap inicial. A autenticação (email + palavra-passe) será ligada
              na próxima etapa do Core.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            <p>
              Se não tem acesso, peça ao administrador da sua empresa para o convidar.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
