-- profile_follow_requests (0035) never had a delete policy -- fine while
-- the only outcome was accept/reject via pfr_update_target, but "following"
-- is now a unified concept across the instant-follow table (0061) and an
-- accepted request on this table: unfollowing someone you follow via an
-- accepted private-profile request needs to actually remove that
-- acceptance, not just the (nonexistent, for this case) profile_follows
-- row. Requester-only, same shape as pfr_insert_own -- you can only ever
-- delete your own outgoing request, never someone else's.
create policy "pfr_delete_own" on profile_follow_requests for delete to authenticated
  using (requester_id = auth.uid());
