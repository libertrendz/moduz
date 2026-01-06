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
    desc: "Base do sistema: empresas, perfis, definições, módulos e auditoria.",
    implemented: true,
    locked: true,
  },
  docs: {
    title: "Docs",
    desc: "Documentos e anexos da empresa, ligados a registos e processos.",
    implemented: true,
  },
  people: {
    title: "People",
    desc: "Gestão de pessoas: colaboradores, recrutamento (ATS) e ciclo de vida.",
    implemented: false,
  },
  track: {
    title: "Track",
    desc: "Ponto e registo de tempo: equipas, tarefas e atividades.",
    implemented: false,
  },
  finance: {
    title: "Finance",
    desc: "Movimentos, pagamentos e controlo financeiro operacional.",
    implemented: false,
  },
  bizz: {
    title: "Bizz",
    desc: "Propostas, contratos e ciclo comercial de ponta a ponta.",
    implemented: false,
  },
  stock: {
    title: "Stock",
    desc: "Inventário e movimentações: entradas, saídas e controlo de stock.",
    implemented: false,
  },
  assets: {
    title: "Assets",
    desc: "Ativos e manutenção: registo, estado e histórico.",
    implemented: false,
  },
  flow: {
    title: "Flow",
    desc: "Projetos e processos: execução, etapas e acompanhamento.",
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
