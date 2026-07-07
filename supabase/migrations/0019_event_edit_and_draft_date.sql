-- Event editing (Phase 11 Section 2). Two changes:
--
-- 1. event_date becomes nullable so a duplicated event can genuinely "leave
--    the date blank" rather than carrying over the original's date or
--    needing a fake placeholder -- a null-dated event is a draft, invisible
--    to the public browse/detail routes until the host sets a real date
--    (enforced in application code: getEvents already only lists
--    status='active' events and the detail page 404s a null-dated event for
--    non-hosts).
alter table events alter column event_date drop not null;

-- 2. Real gap found re-reading the policy, not assumed safe: the existing
-- events_update_host_or_admin WITH CHECK constrained host_id (a host can't
-- reassign an event to someone else -- the new host_id must equal their own
-- auth.uid()) but placed no constraint on community_id at all. A host could
-- silently attach their event to a community they don't own or moderate via
-- a direct API call, bypassing the insert-time is_community_staff check
-- entirely (events_insert_host already requires this; update never did).
-- Locked the same way owner_id/claim_status/join_mode are locked on
-- communities (0017): community_id must stay equal to its prior value
-- unless the caller is an admin.
drop policy "events_update_host_or_admin" on events;
create policy "events_update_host_or_admin" on events for update to authenticated
  using (host_id = auth.uid() or is_admin())
  with check (
    is_admin()
    or (
      host_id = auth.uid()
      and community_id is not distinct from (select e.community_id from events e where e.id = events.id)
    )
  );
