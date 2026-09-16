-- Security audit findings (low): two INSERT policies allowed a client to
-- write fields that should only ever be set by the server/trigger side.

-- claims_insert_own (0024) only required claimant_user_id = auth.uid(),
-- with no constraint on status/reviewed_at -- a client could insert a
-- claim pre-marked 'approved'/'rejected' with a forged reviewed_at,
-- forging a fake review audit trail. It can't itself grant ownership
-- (review_community_claim() only fires on UPDATE, never INSERT), but a
-- forged non-pending claim also evades claims_one_pending_per_community
-- (scoped to status='pending'), letting one claimant hold multiple
-- simultaneous non-pending rows per community. Every legitimate insert
-- (submitCommunityClaim on web, the claim screen on mobile) already only
-- ever inserts a fresh, unreviewed claim -- pinning this costs no real
-- functionality.
drop policy "claims_insert_own" on claims;
create policy "claims_insert_own" on claims for insert to authenticated
  with check (claimant_user_id = auth.uid() and status = 'pending' and reviewed_at is null);

-- page_views_insert_public (0021) is `with check (true)` -- fully open,
-- including to anon, which is correct (anonymous view counts matter). But
-- viewer_id itself was never constrained, so a caller could attribute a
-- view to an arbitrary OTHER user's id. PageViewTracker.tsx (the only
-- real caller) only ever passes the current viewer's own id (or null for
-- a signed-out visitor) -- never someone else's -- so this only closes a
-- spoofing path, doesn't restrict any legitimate write.
drop policy "page_views_insert_public" on page_views;
create policy "page_views_insert_public" on page_views for insert
  with check (viewer_id is null or viewer_id = auth.uid());
