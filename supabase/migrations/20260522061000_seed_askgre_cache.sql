insert into public.directory_summary_cache (
  surface_slug,
  offering_count,
  provider_count,
  source_count,
  updated_at
)
values (
  'askgre',
  (select count(*) from public.offerings),
  (select count(distinct coalesce(nullif(organisation_name, ''), nullif(trader_name, ''))) from public.traders),
  1,
  now()
)
on conflict (surface_slug) do update
set
  offering_count = excluded.offering_count,
  provider_count = excluded.provider_count,
  source_count = excluded.source_count,
  updated_at = now();

insert into public.filter_options_cache (
  surface_slug,
  payload,
  updated_at
)
values (
  'askgre',
  '{
    "solutionProviders": [],
    "categories": ["Knowledge", "Product", "Service"],
    "domains6m": ["Manpower", "Method", "Machine", "Material", "Market", "Money"],
    "offeringTypes": ["Blogs", "Consulting", "Financial support", "Machinery", "Market reports", "Market support", "Raw material", "SOP manuals", "Tech transfer", "Training", "Videos"],
    "offeringTypesByDomain": {
      "Manpower": ["Training"],
      "Method": ["Blogs", "Consulting", "SOP manuals", "Tech transfer", "Videos"],
      "Machine": ["Machinery"],
      "Material": ["Raw material"],
      "Market": ["Market reports", "Market support"],
      "Money": ["Financial support"]
    },
    "valueChains": [],
    "applications": [],
    "tags": [],
    "languages": ["English", "Hindi", "KANNADA", "MARATHI", "ODIA", "TELUGU", "TAMIL", "GUJARATI"],
    "geographies": ["India", "Karnataka", "Madhya Pradesh", "Odisha", "Maharashtra", "Telangana", "Jharkhand", "Bihar"]
  }'::jsonb,
  now()
)
on conflict (surface_slug) do update
set
  payload = excluded.payload,
  updated_at = now();

update public.surface_cache_state
set
  directory_dirty = false,
  filters_dirty = false,
  updated_at = now()
where surface_slug = 'askgre';
