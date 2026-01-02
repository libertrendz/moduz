/**
 * =============================================
 * Moduz+ | Módulo Fallback
 * Arquivo: app/adm/[module]/page.tsx
 * Módulo: Core (Admin)
 * Etapa: Fallback de rotas (v1)
 * Descrição:
 *  - Evita 404 em módulos ainda não implementados (ex.: /adm/people)
 *  - Permite que AdmShell + ModuleGuard executem (redirect + popup)
 *  - Não contém lógica de negócio (guard é a fonte de verdade)
 * =============================================
 */

export default function AdmModuleFallbackPage() {
  // Esta página existe apenas para evitar 404 e permitir o guard correr.
  // O ModuleGuard no AdmShell decide: permitir / redireccionar / (futuro: popup).
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
      A verificar acesso ao módulo…
    </div>
  )
}
