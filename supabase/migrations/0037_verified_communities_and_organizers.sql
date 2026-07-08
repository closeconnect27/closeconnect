-- Verified Communities & Organizers (Branch 2). Genuinely separate from
-- the claim system (claims.status/communities.claim_status) -- a claimed/
-- owned community isn't automatically verified, and verification here
-- never touches claim_status or vice versa.
alter table communities add column is_verified boolean not null default false;
alter table communities add column verified_at timestamptz;
alter table communities add column verified_by uuid references profiles(id);

-- Same three, plus phone/email -- organizer-level verification is
-- independent of any specific community (an organizer can run several).
-- verified_phone/verified_email are deliberately manual-only: an admin
-- flips them after actually confirming with the organizer (e.g. a call),
-- not automated OTP. Real SMS OTP needs a paid third-party provider
-- (Twilio or similar) for a feature that doesn't need that cost yet at
-- this scale -- revisit if that assumption changes.
alter table profiles add column is_verified boolean not null default false;
alter table profiles add column verified_at timestamptz;
alter table profiles add column verified_by uuid references profiles(id);
alter table profiles add column verified_phone boolean not null default false;
alter table profiles add column verified_email boolean not null default false;

-- Polymorphic request queue (owner_type/owner_id shape, matching
-- form_fields/form_responses/page_views elsewhere in this schema) --
-- "anyone who requests it" is the threshold (SPEC's own "your call"):
-- admin reviews a real queue of people who asked, not every unverified
-- community/organizer on the site by default.
create table verification_requests (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('community', 'organizer')),
  target_id uuid not null,
  requested_by uuid references profiles(id) not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  review_note text
);
create index verification_requests_target_idx on verification_requests(target_type, target_id);
create index verification_requests_status_idx on verification_requests(status);
-- One pending request per target at a time -- same shape as
-- claims_one_pending_per_community (0024); a rejected request can be
-- resubmitted since the index only scopes to status = 'pending'.
create unique index verification_requests_one_pending on verification_requests(target_type, target_id)
  where status = 'pending';

alter table verification_requests enable row level security;

-- A caller can only request verification for a community they actually
-- staff, or for themselves as an organizer -- never on someone else's
-- behalf.
create policy "verification_requests_insert_own" on verification_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and (
      (target_type = 'community' and is_community_staff(target_id))
      or (target_type = 'organizer' and target_id = auth.uid())
    )
  );
create policy "verification_requests_select_own_or_admin" on verification_requests for select to authenticated
  using (requested_by = auth.uid() or is_admin());
create policy "verification_requests_update_admin" on verification_requests for update to authenticated
  using (is_admin()) with check (is_admin());

-- Same shape as review_community_claim() (0024): one trigger function an
-- admin action can't bypass by only doing half the work (approving the
-- request row without the target ever actually getting flagged verified).
create function public.review_verification_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  new.reviewed_at = now();
  new.reviewed_by = auth.uid();

  if new.status = 'approved' then
    if new.target_type = 'community' then
      update communities set is_verified = true, verified_at = now(), verified_by = auth.uid() where id = new.target_id;
    elsif new.target_type = 'organizer' then
      update profiles set is_verified = true, verified_at = now(), verified_by = auth.uid() where id = new.target_id;
    end if;
  end if;

  return new;
end;
$$;
create trigger verification_request_reviewed
  before update on verification_requests
  for each row
  when (new.status is distinct from old.status)
  execute function public.review_verification_request();
