<!--
=============================================
Moduz+ | Schema Inventory (Fonte de Verdade)
Arquivo: docs/schema.md
Módulo: Core (transversal)
Etapa: MVP Técnico – Fase A (Rastreabilidade)
Descrição: Inventário humano do schema (tabelas/views/RPCs) por módulo.
Regra: Qualquer migration que crie/renomeie/remova tabela/view/RPC deve atualizar este arquivo.
=============================================
-->

# Moduz+ — Inventário do Schema

Este documento é a **fonte de verdade humana** do schema do Moduz+.
Se algo não está aqui, **não existe oficialmente**.

## Convenções
- Prefixos por módulo: `core_` (evitar), `people_`, `track_`, `finance_`, `bizz_`
- Multi-tenant: todas as tabelas de negócio têm `empresa_id`
- RLS: habilitado em todas as tabelas de negócio
- Triggers: `updated_at` em tabelas mutáveis
- Auditoria: ações administrativas relevantes geram evento em `audit_log`

---

## Core (MVP)
**Tabelas**
- (por definir) `empresas`
- (por definir) `profiles`
- (por definir) `modules_enabled`
- (por definir) `settings`
- (por definir) `docs`
- (por definir) `audit_log`

**Funções/RPCs**
- (por definir) `auth_empresa_id()`
- (por definir) `auth_papel()`

**Views**
- (opcional) inventário de schema (fase seguinte)

---

## People v1 (MVP)
**Tabelas**
- (por definir) `people_colaboradores`
- (por definir) `people_contratos`

**RPCs**
- (por definir) `moduz_people_ensure_colaborador_for_user(...)`

---

## Track v1 (MVP)
**Tabelas**
- (por definir) `track_pontos`

**RPCs**
- (por definir) `moduz_track_registar_ponto(...)`

---

## Finance v1 (MVP)
**Tabelas**
- (por definir) `finance_contas`
- (por definir) `finance_centros_custo`
- (por definir) `finance_lancamentos`

---

## Docs (MVP)
- usa `docs` (Core) como transversal

---

## Bizz v1 (MVP)
**Tabelas**
- (por definir) `bizz_orcamentos`
- (por definir) `bizz_orcamento_itens`
- (por definir) `bizz_contratos`
