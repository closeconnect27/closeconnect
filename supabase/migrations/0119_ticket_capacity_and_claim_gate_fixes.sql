-- Two real bugs found by a pre-launch audit, both confirmed by reading the
-- live definitions directly (not just the audit's say-so).

-- 1) CRITICAL: enforce_ticket_capacity() (0055) silently dropped the
-- `security definer` that 0031 had specifically added after finding this
-- exact bug once already -- 0055's rewrite (to sum quantity instead of
-- counting rows) recreated the function without it. Without security
-- definer, the trigger's own `select sum(quantity) from form_responses`
-- runs under the INSERTING user's RLS (form_responses_select_owner_or_
-- respondent: only their own rows), so a non-host registrant's capacity
-- check only ever sees their own registration history -- effectively
-- always ~0 for a new registrant. A ticket type with quantity_available=1
-- could be "sold" to unlimited distinct users. This restores 0031's fix on
-- top of 0055's sum-based logic.
create or replace function public.enforce_ticket_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_capacity integer;
  v_registered integer;
begin
  if new.owner_type <> 'event' or new.ticket_type_id is null then
    return new;
  end if;

  select quantity_available into v_capacity from event_ticket_types where id = new.ticket_type_id;
  if v_capacity is null then
    return new; -- unlimited
  end if;

  perform pg_advisory_xact_lock(hashtext(new.ticket_type_id::text));

  select coalesce(sum(quantity), 0) into v_registered from form_responses
  where owner_type = 'event' and ticket_type_id = new.ticket_type_id;

  if v_registered + new.quantity > v_capacity then
    raise exception 'This ticket type is sold out.';
  end if;

  return new;
end;
$$;

-- 2) claims_insert_own (0024) never checked the target community's
-- claim_status, only that the claimant is who they say they are --
-- submitCommunityClaim (src/app/actions/communities.ts) re-checks
-- claim_status server-side, but that's app-layer, and mobile's claim
-- screen inserts directly via the Supabase client with no equivalent
-- check at all. Any authenticated caller (mobile, or anyone hitting the
-- REST API directly) could file a claim against an already-owned,
-- actively-staffed community, flipping its claim_status to 'pending' via
-- mark_community_claim_pending -- and if approved, review_community_claim
-- reassigns owner_id, a real ownership hijack path. Enforced here so every
-- client is covered, not just the web action.
drop policy "claims_insert_own" on claims;
create policy "claims_insert_own" on claims for insert to authenticated
  with check (
    claimant_user_id = auth.uid()
    and exists (
      select 1 from communities c
      where c.id = community_id and c.claim_status in ('unclaimed', 'rejected')
    )
  );
