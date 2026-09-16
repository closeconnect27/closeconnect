-- community_posts_update_own_or_staff (0103) checked author_id/staff-ness
-- but never pinned community_id or author_id to their existing values --
-- exactly the gap 0017/0095 already close for communities' own owner_id/
-- claim_status/join_mode (and 0019 for events): an update policy's `using`
-- clause only gates which row you can touch, not which COLUMNS you're
-- allowed to change once you're in. Any authenticated user could stand up
-- their own throwaway community (making them "staff" of it via
-- is_community_staff), post there legitimately under 0099's real insert
-- gate, then UPDATE that post's community_id to any other community --
-- passing the `author_id = auth.uid()` branch of the with-check with no
-- community_id/author_id pin, and having it render in a community they
-- were never staff of (feed.tsx joins communities(name) with no re-check).
-- Same gap let staff reattribute a post's author_id to someone else's
-- profile. Editing content/content_content is still fully allowed; only
-- reassigning the post to a different community or author is now blocked.
drop policy "community_posts_update_own_or_staff" on community_posts;
create policy "community_posts_update_own_or_staff" on community_posts for update to authenticated
  using (author_id = auth.uid() or is_community_staff(community_id))
  with check (
    (author_id = auth.uid() or is_community_staff(community_id))
    and community_id = (select p.community_id from community_posts p where p.id = community_posts.id)
    and author_id = (select p.author_id from community_posts p where p.id = community_posts.id)
  );
