/**
 * =============================================
 * Moduz+ | UI Admin
 * Arquivo: app/adm/page.tsx
 * Módulo: Core
 * Etapa: MVP Técnico – Bootstrap Admin UI
 * Descrição: Entrada do painel administrativo (/adm). Guard e menu dinâmico virão no Core.
 * =============================================
 */

export default function AdmHomePage() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
          <h1 className="text-xl font-semibold text-slate-50">Admin • Moduz+</h1>
          <p className="mt-2 text-sm text-slate-400">
            Bootstrap inicial do painel administrativo. Em seguida vamos ligar:
            empresa, profiles, módulos, settings, docs e auditoria.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-medium text-slate-200">Próximo passo</h2>
              <p className="mt-1 text-sm text-slate-400">
                Criar o schema Core no Supabase via migration <code className="text-slate-200">0001_core.sql</code>.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-medium text-slate-200">Regra</h2>
              <p className="mt-1 text-sm text-slate-400">
                Nada de lógica pesada no front. DB → API/RPC → UI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
