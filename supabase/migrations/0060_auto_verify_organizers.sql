-- Organizer verification (0037) required a manual admin-reviewed request --
-- replaced with automatic verification: owning a native community
-- (communities.owner_id) or having hosted an event (events.host_id) is
-- itself sufficient. Community-level verification (communities.is_verified,
-- reviewed via verification_requests target_type='community') is untouched
-- -- this only changes how profiles.is_verified gets set.
--
-- Backfill: anyone who already qualifies today gets marked immediately,
-- not just going forward.
update profiles set is_verified = true, verified_at = coalesce(verified_at, now())
where is_verified = false
and (
  exists (select 1 from communities where owner_id = profiles.id)
  or exists (select 1 from events where host_id = profiles.id)
);

create function public.auto_verify_organizer(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set is_verified = true, verified_at = now()
  where id = p_user_id and is_verified = false;
end;
$$;

-- Fires on a native community's creation (owner_id set at insert) and on
-- claim approval (review_community_claim, 0024, sets owner_id via UPDATE)
-- -- both are "became an owner" moments.
create function public.auto_verify_on_community_owner_set()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    perform public.auto_verify_organizer(new.owner_id);
  end if;
  return new;
end;
$$;
create trigger auto_verify_on_community_owner_set
  after insert or update of owner_id on communities
  for each row execute function public.auto_verify_on_community_owner_set();

create function public.auto_verify_on_event_host_set()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.auto_verify_organizer(new.host_id);
  return new;
end;
$$;
create trigger auto_verify_on_event_host_set
  after insert on events
  for each row execute function public.auto_verify_on_event_host_set();

-- Organizer-type requests are no longer accepted -- only a community's own
-- staff can still request community verification. The one historical
-- organizer row (already reviewed/approved before this change) is left in
-- place untouched, just no new ones can be inserted.
drop policy "verification_requests_insert_own" on verification_requests;
create policy "verification_requests_insert_own" on verification_requests for insert to authenticated
  with check (requested_by = auth.uid() and target_type = 'community' and is_community_staff(target_id));
