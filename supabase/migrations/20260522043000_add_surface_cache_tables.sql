create table if not exists public.surface_cache_state (
  surface_slug text primary key check (surface_slug in ('askgre', 'supergre')),
  directory_dirty boolean not null default true,
  filters_dirty boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.directory_summary_cache (
  surface_slug text primary key references public.surface_cache_state(surface_slug) on delete cascade,
  offering_count integer not null default 0,
  provider_count integer not null default 0,
  source_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.filter_options_cache (
  surface_slug text primary key references public.surface_cache_state(surface_slug) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.surface_cache_state (surface_slug, directory_dirty, filters_dirty)
values
  ('askgre', true, true),
  ('supergre', true, true)
on conflict (surface_slug) do nothing;

create or replace function public.mark_surface_cache_dirty_all()
returns trigger
language plpgsql
as $$
begin
  insert into public.surface_cache_state as state (surface_slug, directory_dirty, filters_dirty, updated_at)
  values
    ('askgre', true, true, now()),
    ('supergre', true, true, now())
  on conflict (surface_slug) do update
    set directory_dirty = true,
        filters_dirty = true,
        updated_at = now();
  return null;
end;
$$;

create or replace function public.mark_surface_cache_dirty_supergre()
returns trigger
language plpgsql
as $$
begin
  insert into public.surface_cache_state as state (surface_slug, directory_dirty, filters_dirty, updated_at)
  values ('supergre', true, true, now())
  on conflict (surface_slug) do update
    set directory_dirty = true,
        filters_dirty = true,
        updated_at = now();
  return null;
end;
$$;

do $$
declare
  trigger_name text;
begin
  for trigger_name in
    select unnest(array[
      'trg_surface_cache_offer',
      'trg_surface_cache_solution',
      'trg_surface_cache_trader',
      'trg_surface_cache_selco_products',
      'trg_surface_cache_selco_vendors',
      'trg_surface_cache_innovation_guild_products',
      'trg_surface_cache_innovation_guild_vendors',
      'trg_surface_cache_gian_innovations',
      'trg_surface_cache_gian_innovators',
      'trg_surface_cache_grid_practices',
      'trg_surface_cache_grid_innovators',
      'trg_surface_cache_better_india_stories',
      'trg_surface_cache_ecosystem_directory_entities'
    ])
  loop
    execute format('drop trigger if exists %I on public.offerings', trigger_name);
    execute format('drop trigger if exists %I on public.solutions', trigger_name);
    execute format('drop trigger if exists %I on public.traders', trigger_name);
    execute format('drop trigger if exists %I on public.selco_products', trigger_name);
    execute format('drop trigger if exists %I on public.selco_vendors', trigger_name);
    execute format('drop trigger if exists %I on public.innovation_guild_products', trigger_name);
    execute format('drop trigger if exists %I on public.innovation_guild_vendors', trigger_name);
    execute format('drop trigger if exists %I on public.gian_innovations', trigger_name);
    execute format('drop trigger if exists %I on public.gian_innovators', trigger_name);
    execute format('drop trigger if exists %I on public.grid_practices', trigger_name);
    execute format('drop trigger if exists %I on public.grid_innovators', trigger_name);
    execute format('drop trigger if exists %I on public.better_india_stories', trigger_name);
    execute format('drop trigger if exists %I on public.ecosystem_directory_entities', trigger_name);
  end loop;
exception when undefined_table then
  null;
end;
$$;

do $$
begin
  if to_regclass('public.offerings') is not null then
    execute 'create trigger trg_surface_cache_offer after insert or update or delete on public.offerings for each statement execute function public.mark_surface_cache_dirty_all()';
  end if;
  if to_regclass('public.solutions') is not null then
    execute 'create trigger trg_surface_cache_solution after insert or update or delete on public.solutions for each statement execute function public.mark_surface_cache_dirty_all()';
  end if;
  if to_regclass('public.traders') is not null then
    execute 'create trigger trg_surface_cache_trader after insert or update or delete on public.traders for each statement execute function public.mark_surface_cache_dirty_all()';
  end if;
  if to_regclass('public.selco_products') is not null then
    execute 'create trigger trg_surface_cache_selco_products after insert or update or delete on public.selco_products for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.selco_vendors') is not null then
    execute 'create trigger trg_surface_cache_selco_vendors after insert or update or delete on public.selco_vendors for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.innovation_guild_products') is not null then
    execute 'create trigger trg_surface_cache_innovation_guild_products after insert or update or delete on public.innovation_guild_products for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.innovation_guild_vendors') is not null then
    execute 'create trigger trg_surface_cache_innovation_guild_vendors after insert or update or delete on public.innovation_guild_vendors for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.gian_innovations') is not null then
    execute 'create trigger trg_surface_cache_gian_innovations after insert or update or delete on public.gian_innovations for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.gian_innovators') is not null then
    execute 'create trigger trg_surface_cache_gian_innovators after insert or update or delete on public.gian_innovators for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.grid_practices') is not null then
    execute 'create trigger trg_surface_cache_grid_practices after insert or update or delete on public.grid_practices for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.grid_innovators') is not null then
    execute 'create trigger trg_surface_cache_grid_innovators after insert or update or delete on public.grid_innovators for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.better_india_stories') is not null then
    execute 'create trigger trg_surface_cache_better_india_stories after insert or update or delete on public.better_india_stories for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
  if to_regclass('public.ecosystem_directory_entities') is not null then
    execute 'create trigger trg_surface_cache_ecosystem_directory_entities after insert or update or delete on public.ecosystem_directory_entities for each statement execute function public.mark_surface_cache_dirty_supergre()';
  end if;
end;
$$;
