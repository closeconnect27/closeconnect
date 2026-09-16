-- Every community becomes 'native' from here on -- kind stops being how
-- "claimable, unowned" is expressed (owner_id/claim_status already carry
-- that alone, see submitCommunityClaim/ClaimSection); an unclaimed listing
-- now gets the full native toolkit (join, groups, chat) immediately instead
-- of waiting for a claim first. Checked against live data before writing
-- this: zero (category, lower(name)) collisions across all 110 existing
-- rows, so the native-only unique index (0043) can't reject this bulk flip.

-- communities_owner_id_check (0024) enforced the OLD meaning of kind --
-- "native implies owned" -- via check ((kind='native' and owner_id is not
-- null) or (kind='external')). That invariant is exactly what this
-- migration retires: an unclaimed community is now native too, with
-- owner_id still legitimately null until claimed. Dropped outright, not
-- replaced with a looser version -- nothing should still be asserting
-- anything about kind vs. owner_id once kind stops carrying that meaning.
alter table communities drop constraint communities_owner_id_check;

-- New dedicated field for a community's WhatsApp group/channel link,
-- alongside the instagram_url/facebook_url/linkedin_url/phone fields
-- (0081) -- external listings only ever had ONE link (either WhatsApp or
-- Instagram, via external_link), so this is what that link becomes for the
-- 82 WhatsApp ones once split out below.
alter table communities add column whatsapp_url text;

-- Split external_link into the right dedicated field. Checked against live
-- data first: all 104 external rows have a non-null external_link, split
-- cleanly 82 whatsapp.com / 22 instagram.com with zero unrecognized links,
-- and none of them already had any social field set -- so this is a plain
-- copy, no overwrite-conflict handling needed.
update communities
set whatsapp_url = external_link
where kind = 'external' and external_link ~ 'whatsapp\.com';

update communities
set instagram_url = external_link
where kind = 'external' and external_link ~ 'instagram\.com';

-- Null out the source column for migrated rows -- its info now lives in
-- the dedicated social fields above, and CommunityDetailActions/
-- CommunityCard no longer render anything off external_link's presence
-- (that "Go Native keeps the old link visible" special case is gone along
-- with the Go Native button itself), so leaving it populated here would
-- just be a second, un-rendered copy of data that's now stale by
-- definition (nothing keeps it in sync with instagram_url/whatsapp_url
-- going forward).
update communities set external_link = null where kind = 'external';

-- These 104 are about to show a live, real member count for the first
-- time (almost all still unclaimed, zero real members) -- default that to
-- hidden rather than a visitor's first impression being "0 members" /
-- "this is empty". Scoped to kind = 'external' (evaluated here, before the
-- flip below) rather than a blanket update -- the 6 pre-existing native
-- communities keep whatever visibility they already have. Still owner-
-- reversible via MembersVisibilityToggle/MemberCountVisibilityToggle.
update communities set members_list_visible = false, member_count_visible = false where kind = 'external';

-- The actual flip. Safe per the collision check above; on_community_created
-- already handles a null owner_id gracefully (0076), so this needs no
-- companion data backfill for groups/membership.
update communities set kind = 'native' where kind = 'external';

-- The anonymous-submission rate limit (0024) was keyed on kind = 'external'
-- and owner_id is null -- submitExternalCommunity still exists (still the
-- public, no-login "list a community" path) and is still the one
-- unauthenticated insert path with no other rate-limit lever, but it now
-- inserts kind = 'native' rows. Re-keyed on owner_id is null alone, which
-- is exactly "anonymous, unclaimed" now that kind no longer distinguishes
-- that -- a real owner-created native community always has owner_id set,
-- so this still can't ever throttle a legitimate authenticated create.
drop trigger communities_external_submission_rate_limit on communities;
drop function public.enforce_external_submission_rate_limit();
drop index communities_external_submission_rate_limit_idx;

create index communities_anonymous_submission_rate_limit_idx
  on communities(created_at desc) where owner_id is null;

create function public.enforce_external_submission_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from communities
    where owner_id is null and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Submitting listings too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger communities_external_submission_rate_limit
  before insert on communities
  for each row
  when (new.owner_id is null)
  execute function public.enforce_external_submission_rate_limit();

-- The RLS policy gating the entire public/anonymous submission (0024) --
-- without this fix, submitExternalCommunity's insert would be rejected
-- outright the moment it starts writing kind = 'native' instead of
-- 'external', since this policy's with check never matches otherwise.
-- owner_id is null + claim_status = 'unclaimed' already fully express
-- "legitimate anonymous submission" on their own; the kind literal here
-- just needs to track what that insert actually writes now.
drop policy "communities_insert_external_public" on communities;
create policy "communities_insert_external_public" on communities for insert
  with check (
    kind = 'native'
    and owner_id is null
    and claim_status = 'unclaimed'
  );

-- claim-proof-images upload eligibility (0058, re-qualified in 0063) --
-- same fix as the two RLS/rate-limit spots above: "still claimable" is
-- claim_status, not kind, now that kind no longer distinguishes claimable
-- from owned. Matches submitCommunityClaim's own server-side check
-- (unclaimed or rejected -- pending/approved can't accept new proof).
drop policy "claim_proof_images_bucket_insert_claimable" on storage.objects;
create policy "claim_proof_images_bucket_insert_claimable" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'claim-proof-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      and c.claim_status in ('unclaimed', 'rejected')
    )
  );
