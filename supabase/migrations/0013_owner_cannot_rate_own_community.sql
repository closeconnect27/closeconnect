-- Product decision: a community owner rating their own community isn't a
-- meaningful signal (not real social proof, and it's a one-sided lever on
-- their own average either direction). The UI already hides "Rate this
-- community" for the owner; this closes the same rule at the RLS layer so a
-- direct insert/update call (bypassing the hidden button entirely) can't do
-- it either -- matching how every other UI-only gate in this app also has a
-- server-side backstop.
drop policy "community_ratings_insert_own" on community_ratings;
create policy "community_ratings_insert_own" on community_ratings for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid())
  );

drop policy "community_ratings_update_own" on community_ratings;
create policy "community_ratings_update_own" on community_ratings for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid())
  );
