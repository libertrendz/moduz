/**
 * =============================================
 * Moduz+ | Module Registry
 * Arquivo: components/adm/module-registry.ts
 * Módulo: Core
 * Etapa: Fonte única (v2)
 * Descrição:
 *  - Metadados de módulos (título/descrição/implemented/locked)
 *  - Rotas de navegação por módulo (somente rotas existentes/previstas)
 *  - Ordem canônica (para listagem e UI)
 * =============================================
 */

export type ModuleKey =
  | "core"
  | "docs"
  | "people"
  | "track"
  | "finance"
  | "bizz"
  | "stock"
  | "assets"
  | "flow"

export type ModuleMeta = {
  title: string
  desc: string
  implemented: boolean
  locked?: boolean
}

export const MODULE_ORDER: ModuleKey[] = [
  "core",
  "docs",
  "people",
  "track",
  "finance",
  "bizz",
  "stock",
  "assets",
  "flow",
]

export const MODULES: Record<ModuleKey, ModuleMeta> = {
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

export type NavItem = {
  href: string
  label: string
}

export const ROUTES_BY_MODULE: Partial<Record<ModuleKey, NavItem>> = {
  core: { href: "/adm", label: "Core" },
  docs: { href: "/adm/docs", label: "Docs" },
  // os demais entram quando existirem rotas reais + implemented=true
}
