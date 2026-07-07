-- Ratings were only ever blocked for the owner (0013) -- anyone else
-- logged in, member or not, could rate a community they'd never joined.
-- Add the members-only requirement at the RLS layer (the real gate),
-- backing up the UI hiding the option for non-members.
drop policy "community_ratings_insert_own" on community_ratings;
create policy "community_ratings_insert_own" on community_ratings for insert
  with check (
    user_id = auth.uid()
    and is_community_member(community_id)
    and not exists (select 1 from communities c where c.id = community_ratings.community_id and c.owner_id = auth.uid())
  );

drop policy "community_ratings_update_own" on community_ratings;
create policy "community_ratings_update_own" on community_ratings for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and is_community_member(community_id)
    and not exists (select 1 from communities c where c.id = community_ratings.community_id and c.owner_id = auth.uid())
  );
