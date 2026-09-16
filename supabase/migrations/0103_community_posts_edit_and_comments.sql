-- Two gaps surfaced while building the mobile app's feed redesign: posts
-- had no UPDATE policy at all (0099 only ever added select/insert/delete),
-- so an "edit my post" feature was impossible regardless of UI; and there
-- was no comment table, matching 0099's own "no comments yet" v1 scope note
-- -- both are now real, requested features.

-- Same author-or-staff shape as community_posts_delete_own_or_staff (0099).
create policy "community_posts_update_own_or_staff" on community_posts for update to authenticated
  using (author_id = auth.uid() or is_community_staff(community_id))
  with check (author_id = auth.uid() or is_community_staff(community_id));

create table community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade not null,
  author_id uuid references profiles(id) not null,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz default now()
);
create index community_post_comments_post_idx on community_post_comments(post_id, created_at);

alter table community_post_comments enable row level security;

-- Same visibility posture as the post itself (0099's select_public) -- a
-- comment on a public post is exactly as public as the post it's attached
-- to, not a narrower audience.
create policy "community_post_comments_select_public" on community_post_comments for select
  using (true);
create policy "community_post_comments_insert_own" on community_post_comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "community_post_comments_delete_own_or_staff" on community_post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or is_community_staff((select community_id from community_posts p where p.id = post_id))
  );
