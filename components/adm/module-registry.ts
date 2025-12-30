/**
 * =============================================
 * Moduz+ | Module Registry
 * Arquivo: components/adm/module-registry.ts
 * Módulo: Core
 * Etapa: Fonte única (v1)
 * Descrição:
 *  - Define metadados de módulos (título/descrição/implemented/locked)
 *  - Define rotas do menu por módulo
 *  - Evita “módulo fantasma” no menu e na UI de toggle
 * =============================================
 */

export type ModuleMeta = {
  title: string
  desc: string
  implemented: boolean
  locked?: boolean
}

export const MODULES: Record<string, ModuleMeta> = {
  core: {
    title: "Core",
    desc: "Base do sistema: empresas, perfis, settings, módulos e auditoria.",
    implemented: true,
    locked: true,
  },
  docs: {
    title: "Docs",
    desc: "Repositório universal de documentos integrado ao Storage.",
    implemented: true,
  },
  people: {
    title: "People",
    desc: "Colaboradores, recrutamento (ATS) e gestão de pessoas.",
    implemented: false,
  },
  track: {
    title: "Track",
    desc: "Ponto e tracking de tempo/atividades.",
    implemented: false,
  },
  finance: {
    title: "Finance",
    desc: "Contas, pagamentos, lançamentos e conciliações (fase 1).",
    implemented: false,
  },
  bizz: {
    title: "Bizz",
    desc: "Orçamentos, contratos e ciclo comercial.",
    implemented: false,
  },
  stock: {
    title: "Stock",
    desc: "Inventário, entradas/saídas e movimentações.",
    implemented: false,
  },
  assets: {
    title: "Assets",
    desc: "Ativos, manutenção e ciclo de vida.",
    implemented: false,
  },
  flow: {
    title: "Flow",
    desc: "Projetos/processos/execução (transversal).",
    implemented: false,
  },
}

export const MODULE_ORDER = [
  "core",
  "docs",
  "people",
  "track",
  "finance",
  "bizz",
  "stock",
  "assets",
  "flow",
] as const

export const ROUTES_BY_MODULE: Record<string, { href: string; label: string }> = {
  core: { href: "/adm", label: "Core" },
  docs: { href: "/adm/docs", label: "Docs" },
  people: { href: "/adm/people", label: "People" },
  track: { href: "/adm/track", label: "Track" },
  finance: { href: "/adm/finance", label: "Finance" },
  bizz: { href: "/adm/bizz", label: "Bizz" },
  stock: { href: "/adm/stock", label: "Stock" },
  assets: { href: "/adm/assets", label: "Assets" },
  flow: { href: "/adm/flow", label: "Flow" },
}
