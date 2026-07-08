-- Event RSVP & Attendance funnel (Branch 4), part 1: "Interested" -- a
-- lightweight pre-registration signal distinct from full registration
-- (form_responses). One row per user per event.
create table event_interests (
  event_id uuid references events(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  -- Opt-in, default false: the host can see the full list of who's
  -- interested only for people who agreed to it, per explicit product
  -- decision -- otherwise the host only gets an aggregate count.
  visible_to_host boolean not null default false,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);
create index event_interests_event_id_idx on event_interests(event_id);

alter table event_interests enable row level security;

create policy "event_interests_insert_own" on event_interests for insert to authenticated
  with check (user_id = auth.uid());
create policy "event_interests_delete_own" on event_interests for delete to authenticated
  using (user_id = auth.uid());
-- A user can always see their own row (so the UI can render "you're
-- interested" state); the host can only see (i.e. read the identity behind)
-- rows marked visible_to_host -- the named list is opt-in.
create policy "event_interests_select_own_or_visible_to_host" on event_interests for select to authenticated
  using (user_id = auth.uid() or (visible_to_host and is_event_host(event_id)));

-- The *aggregate* count is meant to always reflect everyone interested,
-- opted-in or not (only the named list is opt-in-gated) -- RLS row
-- visibility alone can't express "count every row but only let the host
-- read the content of some of them", so this is a security definer
-- function instead, restricted to the host internally rather than left
-- open to anyone.
create function public.get_event_interest_count(p_event_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case
    when is_event_host(p_event_id) then (select count(*) from event_interests where event_id = p_event_id)
    else 0
  end;
$$;
