-- 20251229_core_modules_enabled.sql
-- Core: Gestão de Módulos (modules_enabled) + audit_log + RLS + guardrails
-- Idempotente e tolerante a tabelas antigas (coluna module vs modulo)

begin;

-- =========================================================
-- Extensions
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
  actor_user_id    uuid,
  actor_profile_id uuid,
  action           text not null,
  entity           text,
  entity_id        uuid,
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists audit_log_empresa_created_idx
  on public.audit_log (empresa_id, created_at desc);

alter table public.audit_log enable row level security;

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

-- =========================================================
-- Compatibilidade com versões antigas:
-- - se existir coluna "module", renomear para "modulo"
-- - se não existir "modulo", criar
-- - garantir created_at/updated_at
-- =========================================================
do $$
declare
  has_modulo boolean;
  has_module boolean;
  has_created_at boolean;
  has_updated_at boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='modulo'
  ) into has_modulo;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='module'
  ) into has_module;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='created_at'
  ) into has_created_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='updated_at'
  ) into has_updated_at;

  -- Se veio de um esquema antigo com "module"
  if (not has_modulo) and has_module then
    execute 'alter table public.modules_enabled rename column module to modulo';
    has_modulo := true;
  end if;

  -- Se não existe nenhuma coluna para o nome do módulo, cria
  if not has_modulo then
    execute 'alter table public.modules_enabled add column modulo text';
    -- tenta popular com default seguro (se já há linhas antigas sem coluna, ficam null e vamos corrigir mais abaixo)
    execute 'update public.modules_enabled set modulo = ''core'' where modulo is null';
    -- só depois impõe NOT NULL
    execute 'alter table public.modules_enabled alter column modulo set not null';
  end if;

  if not has_created_at then
    execute 'alter table public.modules_enabled add column created_at timestamptz not null default now()';
  end if;

  if not has_updated_at then
    execute 'alter table public.modules_enabled add column updated_at timestamptz not null default now()';
  end if;

end$$;

-- =========================================================
-- Constraint: lista oficial de módulos (só cria se a coluna existir)
-- =========================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='modulo'
  ) then
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
  end if;
end$$;

-- =========================================================
-- PK: garantir primary key (empresa_id, modulo)
-- Se já existir uma PK diferente, tenta substituir.
-- =========================================================
do $$
declare
  current_pk_name text;
  pk_is_correct boolean;
begin
  -- existe PK?
  select conname
  into current_pk_name
  from pg_constraint
  where conrelid = 'public.modules_enabled'::regclass
    and contype = 'p'
  limit 1;

  -- PK correta?
  select exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a1 on a1.attrelid=t.oid and a1.attnum = c.conkey[1]
    join pg_attribute a2 on a2.attrelid=t.oid and a2.attnum = c.conkey[2]
    where n.nspname='public'
      and t.relname='modules_enabled'
      and c.contype='p'
      and array_length(c.conkey,1)=2
      and a1.attname='empresa_id'
      and a2.attname='modulo'
  ) into pk_is_correct;

  if current_pk_name is null then
    -- não tem PK: cria
    execute 'alter table public.modules_enabled add primary key (empresa_id, modulo)';
  elsif pk_is_correct = false then
    -- tem PK mas diferente: substitui
    execute format('alter table public.modules_enabled drop constraint %I', current_pk_name);
    execute 'alter table public.modules_enabled add primary key (empresa_id, modulo)';
  end if;
end$$;

-- =========================================================
-- Trigger updated_at (idempotente)
-- =========================================================
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

-- =========================================================
-- Guardrails: normaliza e bloqueia core=false
-- =========================================================
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

-- =========================================================
-- RLS
-- =========================================================
alter table public.modules_enabled enable row level security;

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
-- Seed function (idempotente)
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
