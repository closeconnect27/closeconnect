-- Close.Connect — initial schema + RLS (SPEC.md Section 5)
create extension if not exists pgcrypto;

-- =========================================================================
-- CORE IDENTITY
-- =========================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  interests text[],
  host_rating numeric(2,1) default 0,
  is_admin boolean not null default false, -- platform moderation; not in SPEC.md, see chat notes
  created_at timestamptz default now()
);

-- Auto-create a profile row when a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- COMMUNITIES (native + external)
-- =========================================================================

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  category text not null,
  extra_categories text[] default '{}',
  city text,
  community_type text not null default 'both' check (community_type in ('online','offline','both')),
  kind text not null check (kind in ('native','external')),
  external_link text,
  join_mode text default 'open' check (join_mode in ('open','request')),
  cover_image_url text,
  owner_id uuid references profiles(id) not null,
  claim_status text default 'unclaimed' check (claim_status in ('unclaimed','pending','approved','rejected')),
  avg_rating numeric(2,1) default 0,
  rating_count int default 0,
  member_count int default 0,
  status text default 'active' check (status in ('active','hidden','reported')),
  created_at timestamptz default now()
);
create index communities_owner_id_idx on communities(owner_id);

create table community_groups (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  name text not null,
  description text,
  is_announcement boolean default false,
  is_default boolean default false,
  created_at timestamptz default now()
);
create index community_groups_community_id_idx on community_groups(community_id);

create table community_members (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member' check (role in ('owner','moderator','member')),
  joined_at timestamptz default now(),
  primary key (community_id, user_id)
);

create table community_group_members (
  group_id uuid references community_groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table community_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references community_groups(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz default now()
);
create index community_messages_group_id_idx on community_messages(group_id, created_at);

create table community_ratings (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  review text,
  created_at timestamptz default now(),
  primary key (community_id, user_id)
);

-- =========================================================================
-- EVENTS (host-first, community optional)
-- =========================================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id) not null,
  community_id uuid references communities(id),
  event_name text not null,
  description text,
  event_date date not null,
  event_time time,
  venue text,
  city text,
  category text,
  cover_image_url text,
  status text default 'active' check (status in ('active','cancelled')),
  created_at timestamptz default now()
);
create index events_host_id_idx on events(host_id);
create index events_community_id_idx on events(community_id);

create table event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  name text not null,
  price numeric(10,2) default 0,
  payment_link text,
  quantity_available int,
  sort_order int default 0
);
create index event_ticket_types_event_id_idx on event_ticket_types(event_id);

-- =========================================================================
-- UNIFIED FORM SYSTEM (event registration + community join-requests)
-- =========================================================================

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('event','community')),
  owner_id uuid not null,
  label text not null,
  field_type text not null check (field_type in ('text','textarea','email','phone','number','select')),
  options text[],
  is_required boolean default true,
  sort_order int default 0
);
create index form_fields_owner_idx on form_fields(owner_type, owner_id);

create table form_responses (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('event','community')),
  owner_id uuid not null,
  ticket_type_id uuid references event_ticket_types(id),
  respondent_id uuid references profiles(id),
  response_data jsonb not null,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  checked_in_at timestamptz,
  created_at timestamptz default now()
);
create index form_responses_owner_idx on form_responses(owner_type, owner_id);
create index form_responses_respondent_idx on form_responses(respondent_id);

-- =========================================================================
-- MODERATION
-- =========================================================================

create table reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('community','event','message','user')),
  target_id uuid not null,
  reporter_id uuid references profiles(id),
  reason text not null,
  status text default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz default now()
);

-- =========================================================================
-- RLS HELPER FUNCTIONS (security definer + stable: avoid recursive RLS,
-- keep policies short. All read tables that are themselves public-select,
-- so this doesn't expand privilege — it just dodges policy re-evaluation.)
-- =========================================================================

create function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create function public.is_community_staff(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = p_community_id and user_id = auth.uid() and role in ('owner','moderator')
  );
$$;

create function public.is_community_member(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = p_community_id and user_id = auth.uid()
  );
$$;

create function public.is_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function public.is_event_host(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events where id = p_event_id and host_id = auth.uid()
  );
$$;

-- =========================================================================
-- TRIGGERS: community lifecycle
-- =========================================================================

-- Every community gets a default "General" group, matching an owner into
-- it as a member, plus an announcement group. Runs as the owner's own
-- transaction (not security definer) since it fires off the owner's insert.
create function public.on_community_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_general_id uuid;
begin
  insert into community_groups (community_id, name, is_default)
  values (new.id, 'General', true)
  returning id into v_general_id;

  insert into community_groups (community_id, name, is_announcement, is_default)
  values (new.id, 'Announcements', true, false);

  insert into community_members (community_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (community_id, user_id) do nothing;

  insert into community_group_members (group_id, user_id)
  select cg.id, new.owner_id from community_groups cg
  where cg.community_id = new.id and cg.is_default
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;

create trigger community_created_setup
  after insert on communities
  for each row execute function public.on_community_created();

-- Single approval path for BOTH open-join auto-approval and manual admin
-- approval (SPEC.md Section 7) — fires whenever a community form_response
-- lands in (or moves to) 'approved'. `on conflict do nothing` makes this
-- safe against double-submission (Section 11 checklist).
create function public.approve_join_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_type <> 'community' or new.status <> 'approved' then
    return new;
  end if;

  insert into community_members (community_id, user_id)
  values (new.owner_id, new.respondent_id)
  on conflict (community_id, user_id) do nothing;

  insert into community_group_members (group_id, user_id)
  select cg.id, new.respondent_id from community_groups cg
  where cg.community_id = new.owner_id and cg.is_default
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;

create trigger form_response_approved
  after insert or update on form_responses
  for each row
  when (new.owner_type = 'community' and new.status = 'approved')
  execute function public.approve_join_request();

-- =========================================================================
-- TRIGGERS: denormalized counters
-- =========================================================================

create function public.sync_community_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update communities set member_count = (
    select count(*) from community_members
    where community_id = coalesce(new.community_id, old.community_id)
  ) where id = coalesce(new.community_id, old.community_id);
  return null;
end;
$$;

create trigger community_members_count_sync
  after insert or delete on community_members
  for each row execute function public.sync_community_member_count();

create function public.sync_community_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update communities set
    avg_rating = coalesce((select round(avg(rating)::numeric, 1) from community_ratings where community_id = coalesce(new.community_id, old.community_id)), 0),
    rating_count = (select count(*) from community_ratings where community_id = coalesce(new.community_id, old.community_id))
  where id = coalesce(new.community_id, old.community_id);
  return null;
end;
$$;

create trigger community_ratings_sync
  after insert or update or delete on community_ratings
  for each row execute function public.sync_community_rating();

-- =========================================================================
-- RLS
-- =========================================================================

alter table profiles enable row level security;
alter table communities enable row level security;
alter table community_groups enable row level security;
alter table community_members enable row level security;
alter table community_group_members enable row level security;
alter table community_messages enable row level security;
alter table community_ratings enable row level security;
alter table events enable row level security;
alter table event_ticket_types enable row level security;
alter table form_fields enable row level security;
alter table form_responses enable row level security;
alter table reports enable row level security;

-- profiles ---------------------------------------------------------------
create policy "profiles_select_public" on profiles for select using (true);
create policy "profiles_insert_own" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- communities --------------------------------------------------------------
create policy "communities_select_active_or_own" on communities for select
  using (status = 'active' or owner_id = auth.uid() or is_admin());
create policy "communities_insert_authenticated" on communities for insert to authenticated
  with check (owner_id = auth.uid());
create policy "communities_update_owner_or_admin" on communities for update to authenticated
  using (owner_id = auth.uid() or is_community_staff(id) or is_admin())
  with check (owner_id = auth.uid() or is_community_staff(id) or is_admin());
create policy "communities_delete_admin" on communities for delete to authenticated
  using (is_admin());

-- community_groups ---------------------------------------------------------
create policy "community_groups_select_public" on community_groups for select using (true);
create policy "community_groups_insert_staff" on community_groups for insert to authenticated
  with check (is_community_staff(community_id));
create policy "community_groups_update_staff" on community_groups for update to authenticated
  using (is_community_staff(community_id)) with check (is_community_staff(community_id));
create policy "community_groups_delete_staff" on community_groups for delete to authenticated
  using (is_community_staff(community_id));

-- community_members ---------------------------------------------------------
create policy "community_members_select_public" on community_members for select using (true);
create policy "community_members_insert_self_open" on community_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from communities c where c.id = community_id and c.join_mode = 'open')
  );
create policy "community_members_update_staff" on community_members for update to authenticated
  using (is_community_staff(community_id)) with check (is_community_staff(community_id));
create policy "community_members_delete_self_or_staff" on community_members for delete to authenticated
  using (user_id = auth.uid() or is_community_staff(community_id));

-- community_group_members ---------------------------------------------------------
create policy "community_group_members_select_members" on community_group_members for select to authenticated
  using (is_community_member((select community_id from community_groups where id = group_id)));
create policy "community_group_members_insert_self" on community_group_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_community_member((select community_id from community_groups where id = group_id))
  );
create policy "community_group_members_delete_self_or_staff" on community_group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or is_community_staff((select community_id from community_groups where id = group_id))
  );

-- community_messages ---------------------------------------------------------
create policy "community_messages_select_group_members" on community_messages for select to authenticated
  using (is_group_member(group_id));
create policy "community_messages_insert_group_members" on community_messages for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id));
create policy "community_messages_delete_own_or_staff" on community_messages for delete to authenticated
  using (
    user_id = auth.uid()
    or is_community_staff((select community_id from community_groups where id = group_id))
  );

-- community_ratings ---------------------------------------------------------
create policy "community_ratings_select_public" on community_ratings for select using (true);
create policy "community_ratings_insert_own" on community_ratings for insert to authenticated
  with check (user_id = auth.uid());
create policy "community_ratings_update_own" on community_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "community_ratings_delete_own" on community_ratings for delete to authenticated
  using (user_id = auth.uid());

-- events ---------------------------------------------------------
create policy "events_select_active_or_own" on events for select
  using (status = 'active' or host_id = auth.uid() or is_admin());
create policy "events_insert_host" on events for insert to authenticated
  with check (
    host_id = auth.uid()
    and (community_id is null or is_community_staff(community_id))
  );
create policy "events_update_host_or_admin" on events for update to authenticated
  using (host_id = auth.uid() or is_admin())
  with check (host_id = auth.uid() or is_admin());
create policy "events_delete_host_or_admin" on events for delete to authenticated
  using (host_id = auth.uid() or is_admin());

-- event_ticket_types ---------------------------------------------------------
create policy "event_ticket_types_select_public" on event_ticket_types for select using (true);
create policy "event_ticket_types_insert_host" on event_ticket_types for insert to authenticated
  with check (is_event_host(event_id));
create policy "event_ticket_types_update_host" on event_ticket_types for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));
create policy "event_ticket_types_delete_host" on event_ticket_types for delete to authenticated
  using (is_event_host(event_id));

-- form_fields (polymorphic owner_type/owner_id) ---------------------------------------------------------
create function public.owns_form_target(p_owner_type text, p_owner_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_owner_type
    when 'event' then is_event_host(p_owner_id)
    when 'community' then is_community_staff(p_owner_id)
    else false
  end;
$$;

create policy "form_fields_select_public" on form_fields for select using (true);
create policy "form_fields_insert_owner" on form_fields for insert to authenticated
  with check (owns_form_target(owner_type, owner_id));
create policy "form_fields_update_owner" on form_fields for update to authenticated
  using (owns_form_target(owner_type, owner_id)) with check (owns_form_target(owner_type, owner_id));
create policy "form_fields_delete_owner" on form_fields for delete to authenticated
  using (owns_form_target(owner_type, owner_id));

-- form_responses (PII — never publicly readable) ---------------------------------------------------------
create policy "form_responses_select_owner_or_respondent" on form_responses for select to authenticated
  using (owns_form_target(owner_type, owner_id) or respondent_id = auth.uid());

-- Guest-friendly event registration: anon + authenticated, always instant-approved.
create policy "form_responses_insert_event_guest" on form_responses for insert
  with check (
    owner_type = 'event'
    and status = 'approved'
    and (respondent_id is null or respondent_id = auth.uid())
  );

-- Community join-request/open-join: authenticated only. 'approved' is only
-- allowed to be self-submitted when the community is open-join — request-mode
-- communities must go through pending -> owner approval.
create policy "form_responses_insert_community" on form_responses for insert to authenticated
  with check (
    owner_type = 'community'
    and respondent_id = auth.uid()
    and (
      (status = 'pending' and exists (select 1 from communities c where c.id = owner_id and c.join_mode = 'request'))
      or (status = 'approved' and exists (select 1 from communities c where c.id = owner_id and c.join_mode = 'open'))
    )
  );

create policy "form_responses_update_owner" on form_responses for update to authenticated
  using (owns_form_target(owner_type, owner_id))
  with check (owns_form_target(owner_type, owner_id));

create policy "form_responses_delete_admin" on form_responses for delete to authenticated
  using (is_admin());

-- reports ---------------------------------------------------------
create policy "reports_select_admin" on reports for select to authenticated using (is_admin());
create policy "reports_insert_authenticated" on reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "reports_update_admin" on reports for update to authenticated using (is_admin()) with check (is_admin());
create policy "reports_delete_admin" on reports for delete to authenticated using (is_admin());
