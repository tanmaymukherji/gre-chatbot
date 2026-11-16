create table if not exists public.gre_privileged_action_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('provider_email', 'sixm_email')),
  outcome text not null default 'claimed' check (outcome in ('claimed', 'succeeded', 'failed')),
  target_ref text,
  surface_slug text not null check (surface_slug in ('askgre', 'supergre')),
  occurred_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists gre_privileged_action_events_quota_idx
  on public.gre_privileged_action_events (user_id, action, occurred_at desc);

alter table public.gre_privileged_action_events enable row level security;
alter table public.gre_privileged_action_events force row level security;

revoke all on table public.gre_privileged_action_events from public, anon, authenticated;
grant select, insert, update on table public.gre_privileged_action_events to service_role;

create or replace function public.gre_claim_privileged_action(
  p_user_id uuid,
  p_action text,
  p_surface_slug text,
  p_target_ref text,
  p_limit integer,
  p_window_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_count integer;
begin
  if p_user_id is null
     or p_action not in ('provider_email', 'sixm_email')
     or p_surface_slug not in ('askgre', 'supergre')
     or p_limit < 1 or p_limit > 100
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid privileged action claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_action, 0)
  );

  select count(*)::integer
    into v_count
    from public.gre_privileged_action_events
   where user_id = p_user_id
     and action = p_action
     and occurred_at >= now() - pg_catalog.make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return null;
  end if;

  insert into public.gre_privileged_action_events (
    user_id, action, outcome, target_ref, surface_slug
  ) values (
    p_user_id, p_action, 'claimed', left(nullif(p_target_ref, ''), 200), p_surface_slug
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.gre_claim_privileged_action(uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.gre_claim_privileged_action(uuid, text, text, text, integer, integer)
  to service_role;
