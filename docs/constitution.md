<!--
=============================================
Moduz+ | Constitution (Decisões Oficiais)
Arquivo: docs/constitution.md
Descrição: Contrato de produto e engenharia (imutáveis até revisão formal).
=============================================
-->

# Moduz+ — Constitution

## Princípios imutáveis
- DB → API/RPC → UI (DB é fonte de verdade)
- Multi-tenant: tudo com `empresa_id` + RLS
- Core não conhece regras de negócio
- Módulos independentes, ativáveis por empresa
- Validação por fluxo (não por cadastro)
- Repo e schema limpos: sem tabelas duplicadas/adivinhação

## Rotas e padrões
- UI Admin: `/adm`
- APIs Admin: `/api/admin/**`
- Menu principal curto; submódulos dentro do módulo

## Auth (decisão)
- Padrão: email + senha
- Alternativa: OTP/magic link disponível (uso suave)
- Reset: admin inicia → user define a própria senha
- Multi-empresa: contexto por `active_empresa_id` (não “hardcode” no login)

## MVP técnico (resumo)
- Core: empresas, profiles, modules_enabled, settings, docs, audit_log
- People v1: colaboradores (mínimo), contratos simples
- Track v1: ponto (interno + externo controlado)
- Finance v1: contas, lançamentos, centros de custo (gestão, não fiscal)
- Bizz v1: orçamentos e contratos simples
- ATS: fora do MVP (apenas contrato “candidato → colaborador” permitido como fundação)
