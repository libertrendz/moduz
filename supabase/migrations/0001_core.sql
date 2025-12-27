-- =============================================
-- Moduz+ | Supabase Migration
-- Arquivo: supabase/migrations/0001_core.sql
-- Módulo: Core
-- Etapa: MVP Técnico – Fase 1 (Core)
-- Dependências: pgcrypto
-- Impacto: Estrutural (IMUTÁVEL)
-- Descrição: Cria o Core do Moduz+ (empresas, profiles, módulos, settings, docs, audit) com RLS.
-- Observação: no MVP, as policies usam auth.uid() + profiles para multi-tenant.
-- =============================================

-- 0) Extensões
create extension if not exists pgcrypto;

-- 1) Helpers (triggers)
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Helpers (auth)
-- Lê claims do JWT quando existirem. No MVP pode retornar null para empresa_id.
create or replace function public.auth_empresa_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'empresa_id'),
    ''
  )::uuid
$$;

create or replace function public.auth_papel()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

-- 3) Tabelas Core

-- 3.1 empresas (tenant)
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empresas_slug_idx on public.empresas (slug);

drop trigger if exists set_updated_at_empresas on public.empresas;
create trigger set_updated_at_empresas
before update on public.empresas
for each row execute function public.tg_set_updated_at();

-- 3.2 profiles (user ↔ empresa ↔ papel)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'moduz_role') then
    create type public.moduz_role as enum ('admin', 'interno', 'externo');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null, -- referencia auth.users(id) (não FK direto por padrão Supabase)
  role public.moduz_role not null default 'interno',
  ativo boolean not null default true,
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_empresa_user_unique unique (empresa_id, user_id)
);

create index if not exists profiles_user_idx on public.profiles (user_id);
create index if not exists profiles_empresa_idx on public.profiles (empresa_id);

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.tg_set_updated_at();

-- 3.3 modules_enabled (módulos ativos por empresa)
create table if not exists public.modules_enabled (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_enabled_empresa_module_unique unique (empresa_id, module_key)
);

create index if not exists modules_enabled_empresa_idx on public.modules_enabled (empresa_id);
create index if not exists modules_enabled_module_idx on public.modules_enabled (module_key);

drop trigger if exists set_updated_at_modules_enabled on public.modules_enabled;
create trigger set_updated_at_modules_enabled
before update on public.modules_enabled
for each row execute function public.tg_set_updated_at();

-- 3.4 settings (config global por empresa)
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  timezone text not null default 'Europe/Lisbon',
  locale text not null default 'pt-PT',
  currency text not null default 'EUR',
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_empresa_unique unique (empresa_id)
);

create index if not exists settings_empresa_idx on public.settings (empresa_id);

drop trigger if exists set_updated_at_settings on public.settings;
create trigger set_updated_at_settings
before update on public.settings
for each row execute function public.tg_set_updated_at();

-- 3.5 docs (repositório universal)
create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,

  -- ligação transversal
  ref_table text null,
  ref_id uuid null,

  -- storage
  storage_bucket text not null default 'moduz-docs',
  storage_path text not null,
  filename text null,
  mime_type text null,
  size_bytes bigint null,

  created_by uuid null, -- auth.users.id
  created_at timestamptz not null default now()
);

create index if not exists docs_empresa_idx on public.docs (empresa_id);
create index if not exists docs_ref_idx on public.docs (ref_table, ref_id);

-- 3.6 audit_log (auditoria mínima)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,

  actor_user_id uuid null,
  action text not null,
  entity_table text null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists audit_log_empresa_idx on public.audit_log (empresa_id);
create index if not exists audit_log_action_idx on public.audit_log (action);
create index if not exists audit_log_entity_idx on public.audit_log (entity_table, entity_id);

-- 4) RLS enable
alter table public.empresas enable row level security;
alter table public.profiles enable row level security;
alter table public.modules_enabled enable row level security;
alter table public.settings enable row level security;
alter table public.docs enable row level security;
alter table public.audit_log enable row level security;

-- 5) Policies (idempotentes)

-- empresas
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresas' and policyname='empresas_select_by_membership') then
    create policy empresas_select_by_membership
    on public.empresas
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = empresas.id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresas' and policyname='empresas_insert_admin') then
    create policy empresas_insert_admin
    on public.empresas
    for insert
    to authenticated
    with check (true);
    -- Nota: criação de empresas no MVP será feita por API admin (service role).
    -- Mantemos policy permissiva para não travar dev; pode ser endurecida depois.
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresas' and policyname='empresas_update_admin') then
    create policy empresas_update_admin
    on public.empresas
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = empresas.id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    )
    with check (true);
  end if;
end $$;

-- profiles
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own_company') then
    create policy profiles_select_own_company
    on public.profiles
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = profiles.empresa_id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_admin') then
    create policy profiles_insert_admin
    on public.profiles
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = profiles.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_admin') then
    create policy profiles_update_admin
    on public.profiles
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = profiles.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    )
    with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_delete_admin') then
    create policy profiles_delete_admin
    on public.profiles
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = profiles.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    );
  end if;
end $$;

-- modules_enabled
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modules_enabled' and policyname='modules_select_membership') then
    create policy modules_select_membership
    on public.modules_enabled
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = modules_enabled.empresa_id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modules_enabled' and policyname='modules_write_admin') then
    create policy modules_write_admin
    on public.modules_enabled
    for all
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = modules_enabled.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    )
    with check (true);
  end if;
end $$;

-- settings
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='settings' and policyname='settings_select_membership') then
    create policy settings_select_membership
    on public.settings
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = settings.empresa_id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='settings' and policyname='settings_write_admin') then
    create policy settings_write_admin
    on public.settings
    for all
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = settings.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    )
    with check (true);
  end if;
end $$;

-- docs
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='docs' and policyname='docs_select_membership') then
    create policy docs_select_membership
    on public.docs
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = docs.empresa_id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='docs' and policyname='docs_insert_membership') then
    create policy docs_insert_membership
    on public.docs
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = docs.empresa_id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='docs' and policyname='docs_delete_admin') then
    create policy docs_delete_admin
    on public.docs
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = docs.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    );
  end if;
end $$;

-- audit_log (só leitura para membros; escrita idealmente via service role no MVP)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_log' and policyname='audit_select_membership') then
    create policy audit_select_membership
    on public.audit_log
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = audit_log.empresa_id
          and p.user_id = auth.uid()
          and p.ativo = true
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_log' and policyname='audit_insert_admin') then
    create policy audit_insert_admin
    on public.audit_log
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.profiles p
        where p.empresa_id = audit_log.empresa_id
          and p.user_id = auth.uid()
          and p.role = 'admin'
          and p.ativo = true
      )
    );
  end if;
end $$;
