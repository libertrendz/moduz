-- 20251229_core_modules_enabled_v3.sql
-- Core: Gestão de Módulos (schema existente: module_key/enabled/enabled_at)
-- - garante unicidade por empresa+module_key
-- - dedup seguro
-- - check de módulos válidos
-- - guardrail: core não pode ser desativado
-- - view de compatibilidade (modulo/ativo)
-- - seed function idempotente

begin;

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists pgcrypto;

-- =========================================================
-- Helpers (se ainda não existirem)
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
-- 0) Pré-requisito: tabela existe?
-- =========================================================
do $$
begin
  if to_regclass('public.modules_enabled') is null then
    raise exception 'Tabela public.modules_enabled não existe. Abortando migration.';
  end if;
end$$;

-- =========================================================
-- 1) Garantir colunas esperadas (idempotente)
-- =========================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='module_key'
  ) then
    raise exception 'Coluna module_key não existe em public.modules_enabled. Abortando.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='enabled'
  ) then
    raise exception 'Coluna enabled não existe em public.modules_enabled. Abortando.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='enabled_at'
  ) then
    alter table public.modules_enabled
      add column enabled_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='modules_enabled' and column_name='updated_at'
  ) then
    alter table public.modules_enabled
      add column updated_at timestamptz not null default now();
  end if;
end$$;

-- Normaliza module_key (trim/lower) antes de constraints
update public.modules_enabled
set module_key = lower(trim(module_key))
where module_key is not null
  and module_key <> lower(trim(module_key));

-- =========================================================
-- 2) Dedup: manter 1 linha por (empresa_id, module_key)
-- (mantém a mais recente por updated_at, depois enabled_at, depois id)
-- =========================================================
do $$
begin
  execute $q$
    with ranked as (
      select
        ctid,
        empresa_id,
        module_key,
        row_number() over (
          partition by empresa_id, module_key
          order by updated_at desc nulls last, enabled_at desc nulls last, id desc
        ) as rn
      from public.modules_enabled
      where empresa_id is not null and module_key is not null
    )
    delete from public.modules_enabled m
    using ranked r
    where m.ctid = r.ctid
      and r.rn > 1
  $q$;
end$$;

-- =========================================================
-- 3) Unicidade (empresa_id, module_key)
-- =========================================================
create unique index if not exists modules_enabled_empresa_module_uk
  on public.modules_enabled (empresa_id, module_key);

-- =========================================================
-- 4) Check constraint: módulos válidos (idempotente)
-- =========================================================
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'modules_enabled_module_key_chk'
      and conrelid = 'public.modules_enabled'::regclass
  ) then
    alter table public.modules_enabled
      add constraint modules_enabled_module_key_chk
      check (module_key in (
        'core','docs','people','track','finance','bizz','stock','assets','flow'
      ));
  end if;
end$$;

-- =========================================================
-- 5) updated_at trigger (idempotente)
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
-- 6) Guardrail: core não pode ser desativado + seta enabled_at quando ativa
-- =========================================================
create or replace function public.tg_modules_enabled_guardrails_v3()
returns trigger
language plpgsql
as $fn$
begin
  new.module_key := lower(trim(new.module_key));

  if new.module_key = 'core' and new.enabled = false then
    raise exception 'O módulo core não pode ser desativado.';
  end if;

  -- marca data de ativação quando passa para enabled=true
  if (tg_op = 'INSERT') then
    if new.enabled = true and new.enabled_at is null then
      new.enabled_at := now();
    end if;
  elsif (tg_op = 'UPDATE') then
    if new.enabled = true and (old.enabled is distinct from true) then
      new.enabled_at := coalesce(new.enabled_at, now());
    end if;
    -- se desativar, não apagamos enabled_at (histórico)
  end if;

  return new;
end;
$fn$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_modules_enabled_guardrails_v3'
      and tgrelid = 'public.modules_enabled'::regclass
  ) then
    create trigger trg_modules_enabled_guardrails_v3
      before insert or update on public.modules_enabled
      for each row
      execute function public.tg_modules_enabled_guardrails_v3();
  end if;
end$$;

-- =========================================================
-- 7) View compatível com o contrato “modulo/ativo”
-- (para front/back que esperam nomes standard)
-- =========================================================
create or replace view public.vw_modules_enabled as
select
  empresa_id,
  module_key as modulo,
  enabled as ativo,
  enabled_at,
  updated_at
from public.modules_enabled;

-- =========================================================
-- 8) Seed function alinhada ao teu schema (idempotente)
-- =========================================================
create or replace function public.moduz_core_seed_modules(p_empresa_id uuid)
returns void
language plpgsql
security definer
as $fn$
begin
  insert into public.modules_enabled (empresa_id, module_key, enabled, enabled_at)
  values
    (p_empresa_id, 'core', true, now()),
    (p_empresa_id, 'docs', true, now()),
    (p_empresa_id, 'people', false, null),
    (p_empresa_id, 'track', false, null),
    (p_empresa_id, 'finance', false, null),
    (p_empresa_id, 'bizz', false, null),
    (p_empresa_id, 'stock', false, null),
    (p_empresa_id, 'assets', false, null),
    (p_empresa_id, 'flow', false, null)
  on conflict (empresa_id, module_key) do nothing;
end;
$fn$;

commit;
