-- 20251229_core_audit_log.sql
-- Core: audit_log (mínimo) + RLS (select empresa) + índices
-- Idempotente.

begin;

create extension if not exists pgcrypto;

-- Helpers (se não existirem no teu core, criamos versões seguras)
create or replace function public.auth_empresa_id()
returns uuid
language plpgsql
stable
as $fn$
declare
  claims jsonb;
  emp text;
begin
  begin
    claims := auth.jwt();
  exception
    when others then
      return null;
  end;

  emp := claims->>'empresa_id';
  if emp is null then
    return null;
  end if;

  return emp::uuid;
exception
  when others then
    return null;
end;
$fn$;

create or replace function public.auth_papel()
returns text
language sql
stable
as $fn$
  select coalesce((auth.jwt() ->> 'papel'), 'externo');
$fn$;

-- Tabela
create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null,
  actor_user_id    uuid, -- auth.users.id (quando disponível)
  actor_profile_id uuid, -- profiles.id (opcional)
  action           text not null,
  entity           text,
  entity_id        uuid,
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists audit_log_empresa_created_idx
  on public.audit_log (empresa_id, created_at desc);

alter table public.audit_log enable row level security;

-- Policies idempotentes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='audit_log' and policyname='audit_log_select_empresa'
  ) then
    create policy audit_log_select_empresa
      on public.audit_log
      for select
      using (empresa_id = public.auth_empresa_id());
  end if;

  -- Se quiseres permitir inserts via cliente (admin), mantém.
  -- As nossas APIs usam service role, então isto é extra.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='audit_log' and policyname='audit_log_admin_insert'
  ) then
    create policy audit_log_admin_insert
      on public.audit_log
      for insert
      with check (empresa_id = public.auth_empresa_id() and public.auth_papel() = 'admin');
  end if;
end$$;

commit;
