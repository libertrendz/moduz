/**
 * =============================================
 * Moduz+ | Core
 * Arquivo: supabase/migrations/xxxx_core_audit_log_patch.sql
 * Módulo: Core (Audit Log)
 * Etapa: Patch schema audit_log (v1)
 * Descrição:
 *  - Garante colunas padrão do audit_log para inserts de APIs admin
 *  - Idempotente (IF NOT EXISTS)
 * =============================================
 */

do $$
begin
  -- Se a tabela não existir, você deve aplicar a migration completa do audit_log.
  -- Aqui assumimos que ela existe e só vamos "patchar" as colunas que faltam.

  if to_regclass('public.audit_log') is null then
    raise exception 'public.audit_log não existe. Aplique a migration base do Core primeiro.';
  end if;

  -- actor_profile_id (o que está faltando)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='actor_profile_id'
  ) then
    alter table public.audit_log
      add column actor_profile_id uuid null;
  end if;

  -- Colunas padrão úteis (se não existirem, adiciona)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='empresa_id'
  ) then
    alter table public.audit_log
      add column empresa_id uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='actor_user_id'
  ) then
    alter table public.audit_log
      add column actor_user_id uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='action'
  ) then
    alter table public.audit_log
      add column action text null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='entity'
  ) then
    alter table public.audit_log
      add column entity text null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='payload'
  ) then
    alter table public.audit_log
      add column payload jsonb null;
  end if;

  -- created_at padrão (se não existir)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='created_at'
  ) then
    alter table public.audit_log
      add column created_at timestamptz not null default now();
  end if;
end $$;

-- Índices úteis (idempotentes)
create index if not exists audit_log_empresa_id_created_at_idx
  on public.audit_log (empresa_id, created_at desc);

create index if not exists audit_log_actor_user_id_created_at_idx
  on public.audit_log (actor_user_id, created_at desc);
