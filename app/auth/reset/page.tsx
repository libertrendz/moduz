/**
 * =============================================
 * Moduz+ | UI App
 * Arquivo: app/auth/reset/page.tsx
 * Módulo: Core (Auth)
 * Etapa: MVP Técnico – Bootstrap Auth UI
 * Descrição: Página de retorno do reset de palavra-passe (admin inicia, user finaliza).
 * =============================================
 */

export default function AuthResetPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-xl font-semibold text-slate-50">Redefinir palavra-passe</h1>
        <p className="mt-2 text-sm text-slate-400">
          Bootstrap inicial. Aqui ficará o formulário para definir uma nova palavra-passe.
        </p>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-300">
            Importante: o administrador apenas inicia o processo. O utilizador define a
            própria palavra-passe.
          </p>
        </div>
      </div>
    </main>
  )
}
