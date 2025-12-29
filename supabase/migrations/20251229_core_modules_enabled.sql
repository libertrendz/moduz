-- 20251229_core_modules_enabled.sql
-- Core: Gestão de Módulos (modules_enabled) + audit_log + RLS + guardrails
-- Idempotente (Supabase/Postgres)

begin;

-- =========================================================
-- Extensions (caso ainda não existam)
-- =========================================================
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =========================================================
-- Helper: updated_at trigger
-- =========================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- =========================================================
-- Helper: JWT claims
-- =========================================================
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

-- =========================================================
-- Tabela: audit_log (mínimo, transversal)
-- =========================================================
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

-- Policies (idempotentes)
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

-- =========================================================
-- Tabela: modules_enabled (Core)
-- =========================================================
create table if not exists public.modules_enabled (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  modulo      text not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (empresa_id, modulo)
);

-- "Enum" leve: lista oficial de módulos (constraint idempotente)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'modules_enabled_modulo_chk'
      and conrelid = 'public.modules_enabled'::regclass
  ) then
    alter table public.modules_enabled
      add constraint modules_enabled_modulo_chk
      check (modulo in (
        'core',
        'docs',
        'people',
        'track',
        'finance',
        'bizz',
        'stock',
        'assets',
        'flow'
      ));
  end if;
end$$;

-- updated_at trigger (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_modules_enabled_updated_at'
      and tgrelid = 'public.modules_enabled'::regclass
  ) then
    create trigger trg_modules_enabled_updated_at
      before update on public.modules_enabled
      for each row
      execute function public.tg_set_updated_at();
  end if;
end$$;

-- Guardrails: Core nunca pode ser desativado + normaliza modulo
create or replace function public.tg_modules_enabled_guardrails()
returns trigger
language plpgsql
as $fn$
begin
  new.modulo := lower(trim(new.modulo));

  if new.modulo = 'core' and new.ativo = false then
    raise exception 'O módulo core não pode ser desativado.';
  end if;

  return new;
end;
$fn$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_modules_enabled_guardrails'
      and tgrelid = 'public.modules_enabled'::regclass
  ) then
    create trigger trg_modules_enabled_guardrails
      before insert or update on public.modules_enabled
      for each row
      execute function public.tg_modules_enabled_guardrails();
  end if;
end$$;

-- RLS
alter table public.modules_enabled enable row level security;

-- Policies (idempotentes)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='modules_enabled' and policyname='modules_enabled_select_empresa'
  ) then
    create policy modules_enabled_select_empresa
      on public.modules_enabled
      for select
      using (empresa_id = public.auth_empresa_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='modules_enabled' and policyname='modules_enabled_admin_write'
  ) then
    create policy modules_enabled_admin_write
      on public.modules_enabled
      for all
      using (empresa_id = public.auth_empresa_id() and public.auth_papel() = 'admin')
      with check (empresa_id = public.auth_empresa_id() and public.auth_papel() = 'admin');
  end if;
end$$;

-- =========================================================
-- Seed function: garante linhas para todos os módulos (por empresa)
-- =========================================================
create or replace function public.moduz_core_seed_modules(p_empresa_id uuid)
returns void
language plpgsql
security definer
as $fn$
begin
  insert into public.modules_enabled (empresa_id, modulo, ativo)
  values
    (p_empresa_id, 'core', true),
    (p_empresa_id, 'docs', true),
    (p_empresa_id, 'people', false),
    (p_empresa_id, 'track', false),
    (p_empresa_id, 'finance', false),
    (p_empresa_id, 'bizz', false),
    (p_empresa_id, 'stock', false),
    (p_empresa_id, 'assets', false),
    (p_empresa_id, 'flow', false)
  on conflict (empresa_id, modulo) do nothing;
end;
$fn$;

-- =========================================================
-- Trigger opcional: auto-seed ao criar empresa
-- (SEM $$ aninhado: usa $emp$)
-- =========================================================
create or replace function public.tg_empresas_seed_modules()
returns trigger
language plpgsql
as $emp$
begin
  perform public.moduz_core_seed_modules(new.id);
  return new;
end;
$emp$;

do $$
begin
  if to_regclass('public.empresas') is not null then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'trg_empresas_seed_modules'
        and tgrelid = 'public.empresas'::regclass
    ) then
      create trigger trg_empresas_seed_modules
        after insert on public.empresas
        for each row
        execute function public.tg_empresas_seed_modules();
    end if;
  end if;
end$$;

commit;
