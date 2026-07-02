create table if not exists public.offering_translation_cache (
  offering_id text not null,
  target_language text not null,
  source_hash text not null,
  translated_payload jsonb not null default '{}'::jsonb,
  provider text not null default 'huggingface',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (offering_id, target_language, source_hash)
);

alter table public.offering_translation_cache enable row level security;

create index if not exists offering_translation_cache_lookup_idx
  on public.offering_translation_cache (offering_id, target_language);

create or replace function public.set_offering_translation_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_offering_translation_cache_updated_at on public.offering_translation_cache;

create trigger set_offering_translation_cache_updated_at
before update on public.offering_translation_cache
for each row
execute function public.set_offering_translation_cache_updated_at();
