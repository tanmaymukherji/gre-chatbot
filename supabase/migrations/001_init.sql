create extension if not exists pgcrypto;

create table if not exists public.data_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  solution_file_name text,
  trader_file_name text,
  source_solution_rows integer,
  source_trader_rows integer,
  inserted_traders integer,
  inserted_solutions integer,
  inserted_offerings integer,
  error_message text
);

create table if not exists public.traders (
  trader_id text primary key,
  trader_name text,
  organisation_name text,
  mobile text,
  email text,
  poc_name text,
  tenant_id text,
  profile_id text,
  description text,
  short_description text,
  tagline text,
  website text,
  created_at_source text,
  association_status text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.solutions (
  solution_id text primary key,
  trader_id text references public.traders (trader_id) on delete set null,
  solution_name text,
  solution_status text,
  publish_status text,
  created_at_source text,
  about_solution_html text,
  about_solution_text text,
  solution_image_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.offerings (
  offering_id text primary key,
  solution_id text references public.solutions (solution_id) on delete set null,
  trader_id text references public.traders (trader_id) on delete set null,
  publish_status text,
  created_at_source text,
  offering_name text,
  offering_category text,
  offering_group text,
  offering_type text,
  domain_6m text,
  primary_valuechain_id text,
  primary_valuechain text,
  primary_application_id text,
  primary_application text,
  valuechains text[] not null default '{}',
  applications text[] not null default '{}',
  tags text[] not null default '{}',
  languages text[] not null default '{}',
  geographies text[] not null default '{}',
  geographies_raw text,
  about_offering_html text,
  about_offering_text text,
  audience text,
  trainer_name text,
  trainer_email text,
  trainer_phone text,
  trainer_details_html text,
  trainer_details_text text,
  duration text,
  prerequisites text,
  service_cost text,
  support_post_service text,
  support_post_service_cost text,
  delivery_mode text,
  certification_offered text,
  cost_remarks text,
  location_availability text,
  service_brochure_url text,
  grade_capacity text,
  product_cost text,
  lead_time text,
  support_details text,
  product_brochure_url text,
  knowledge_content_url text,
  contact_details text,
  gre_link text,
  search_document text not null default '',
  last_import_id uuid references public.data_imports (id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists offerings_publish_status_idx on public.offerings (publish_status);
create index if not exists offerings_group_idx on public.offerings (offering_group);
create index if not exists offerings_6m_idx on public.offerings (domain_6m);
create index if not exists offerings_valuechain_idx on public.offerings (primary_valuechain);
create index if not exists offerings_application_idx on public.offerings (primary_application);
create index if not exists offerings_search_document_idx on public.offerings using gin (to_tsvector('simple', search_document));
create index if not exists offerings_tags_idx on public.offerings using gin (tags);
create index if not exists offerings_languages_idx on public.offerings using gin (languages);
create index if not exists offerings_geographies_idx on public.offerings using gin (geographies);

alter table public.data_imports enable row level security;
alter table public.traders enable row level security;
alter table public.solutions enable row level security;
alter table public.offerings enable row level security;

drop policy if exists "Public read traders" on public.traders;
create policy "Public read traders"
on public.traders
for select
to anon, authenticated
using (true);

drop policy if exists "Public read solutions" on public.solutions;
create policy "Public read solutions"
on public.solutions
for select
to anon, authenticated
using (publish_status = 'Published');

drop policy if exists "Public read offerings" on public.offerings;
create policy "Public read offerings"
on public.offerings
for select
to anon, authenticated
using (publish_status = 'Published');

drop policy if exists "No public import logs" on public.data_imports;
create policy "No public import logs"
on public.data_imports
for select
to authenticated
using (false);
