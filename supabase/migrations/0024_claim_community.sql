-- Claim Community (Phase 11 Section 3, verified missing entirely before
-- building anything -- no public "add an external community" form existed
-- in the app; the only creation path was the logged-in native flow).
--
-- owner_id becomes nullable: external communities start with no owner
-- (submitted by an anonymous visitor) until someone claims and an admin
-- approves it. Native communities always require an owner at creation --
-- that path is untouched, this just stops blocking the external one.
alter table communities alter column owner_id drop not null;
alter table communities add constraint communities_owner_id_check
  check ((kind = 'native' and owner_id is not null) or (kind = 'external'));

-- Real blocking bug found while building this, not assumed away:
-- on_community_created() (0001_init.sql) unconditionally inserts a
-- community_members row using new.owner_id -- user_id is part of that
-- table's primary key, so it can never be null. An external submission
-- with owner_id = null would violate that constraint and abort the whole
-- insert. Guarded so external/unclaimed rows just skip membership setup
-- until a claim is approved (below), which does its own equivalent setup.
create or replace function public.on_community_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_general_id uuid;
begin
  insert into community_groups (community_id, name, is_default)
  values (new.id, 'General', true)
  returning id into v_general_id;

  insert into community_groups (community_id, name, is_announcement, is_default)
  values (new.id, 'Announcements', true, false);

  if new.owner_id is not null then
    insert into community_members (community_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.owner_id from community_groups cg
    where cg.community_id = new.id and cg.is_default
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Public submission: no login required, matching the original site's Add
-- Community modal. No `to authenticated` clause -- applies to anon and
-- authenticated alike. Scoped tightly so this can only ever create the
-- exact shape a legitimate submission produces: external, unowned,
-- unclaimed. A logged-in user's own communities still go through
-- communities_insert_authenticated (owner_id = auth.uid()), unaffected.
create policy "communities_insert_external_public" on communities for insert
  with check (
    kind = 'external'
    and owner_id is null
    and claim_status = 'unclaimed'
  );

-- Anonymous inserts have no owner_id/respondent_id to key a rate limit off
-- (unlike every other creation path in this app, all of which are
-- authenticated) -- a global throttle is the only lever available. Crude
-- but real: without it, this is the one unauthenticated insert path with
-- zero abuse protection at all.
create index communities_external_submission_rate_limit_idx
  on communities(created_at desc) where kind = 'external' and owner_id is null;
create function public.enforce_external_submission_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from communities
    where kind = 'external' and owner_id is null and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Submitting listings too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger communities_external_submission_rate_limit
  before insert on communities
  for each row
  when (new.kind = 'external' and new.owner_id is null)
  execute function public.enforce_external_submission_rate_limit();

-- claims ---------------------------------------------------------
create table claims (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) not null,
  claimant_user_id uuid references profiles(id) not null,
  name text not null,
  phone text not null,
  email text not null,
  proof text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);
create index claims_community_id_idx on claims(community_id);
create index claims_claimant_user_id_idx on claims(claimant_user_id);

-- Only one claim in flight per community at a time -- the community's own
-- claim_status is a single value, not per-claimant, so two simultaneous
-- pending claims would be ambiguous to review and to reflect back onto the
-- community row. A rejected-then-resubmitted claim is still allowed (the
-- index only scopes to status = 'pending').
create unique index claims_one_pending_per_community on claims(community_id) where status = 'pending';

alter table claims enable row level security;

create policy "claims_insert_own" on claims for insert to authenticated
  with check (claimant_user_id = auth.uid());
create policy "claims_select_own_or_admin" on claims for select to authenticated
  using (claimant_user_id = auth.uid() or is_admin());
create policy "claims_update_admin" on claims for update to authenticated
  using (is_admin())
  with check (is_admin());

-- A claimant submitting many claims across different communities isn't
-- blocked by the one-pending-per-community index above (that's per
-- community, not per claimant) -- same rate-limit shape as join requests.
create index claims_rate_limit_idx on claims(claimant_user_id, created_at desc);
create function public.enforce_claim_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from claims
    where claimant_user_id = new.claimant_user_id and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'Submitting claims too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger claims_rate_limit
  before insert on claims
  for each row execute function public.enforce_claim_rate_limit();

-- Submitting a claim also flips the community's claim_status to 'pending'
-- immediately (so the "Claim this community" button disappears right
-- away, not just after an admin acts) -- same insert-triggers-a-side-effect
-- shape as approve_join_request(), just firing on insert instead of on the
-- eventual status change.
create function public.mark_community_claim_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update communities set claim_status = 'pending' where id = new.community_id;
  return new;
end;
$$;
create trigger claim_submitted
  after insert on claims
  for each row execute function public.mark_community_claim_pending();

-- One trigger function handles both outcomes of a review, same pattern as
-- approve_join_request() -- a single code path an admin action can't
-- bypass by only doing half the work (e.g. approving the claim row without
-- the community ever getting a new owner_id, which a two-step
-- action-then-separate-update could leave inconsistent if the second write
-- failed).
create function public.review_community_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  new.reviewed_at = now();

  if new.status = 'approved' then
    update communities set owner_id = new.claimant_user_id, claim_status = 'approved' where id = new.community_id;

    -- Mirrors on_community_created()'s membership setup -- an approved
    -- claim should leave the community exactly as if the claimant had
    -- created it themselves: in the member list, counted in member_count,
    -- already in General + Announcements. Without this, owner_id would be
    -- set but the community_members row (and everything downstream of it)
    -- simply wouldn't exist.
    insert into community_members (community_id, user_id, role)
    values (new.community_id, new.claimant_user_id, 'owner')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.claimant_user_id from community_groups cg
    where cg.community_id = new.community_id and cg.is_default
    on conflict (group_id, user_id) do nothing;
  elsif new.status = 'rejected' then
    update communities set claim_status = 'rejected' where id = new.community_id;
  end if;

  return new;
end;
$$;
create trigger claim_reviewed
  before update on claims
  for each row
  when (new.status is distinct from old.status)
  execute function public.review_community_claim();
