-- Public feed (Instagram/X-style community posts) -- genuinely new, no
-- prior art on either platform. Product shape chosen without further
-- product input (flagged to the user, not blocking on it): staff-only
-- posting (same "who can broadcast" precedent as announcement circles),
-- public visibility (posts are meant to be seen publicly, per the actual
-- request), text + a single optional image, chronological ordering,
-- likes only for v1 (no comments yet -- keeps moderation surface area
-- smaller for a first cut of a brand-new public-content feature).
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  author_id uuid references profiles(id) not null,
  content text not null check (char_length(content) between 1 and 2000),
  image_path text,
  created_at timestamptz default now()
);
create index community_posts_community_idx on community_posts(community_id, created_at desc);
create index community_posts_created_idx on community_posts(created_at desc);

alter table community_posts enable row level security;

-- Public, unconditionally -- the whole point of this feature is posts
-- visible outside the community's own membership, same as the request
-- that named it ("communities can post anything publicly").
create policy "community_posts_select_public" on community_posts for select
  using (true);

-- Staff-only posting, mirroring announcement-circle posting restrictions
-- (0020_announcement_group_access.sql) -- a public broadcast channel needs
-- the same "who can post" gate a private one already has, arguably more so
-- since this is public-facing.
create policy "community_posts_insert_staff" on community_posts for insert to authenticated
  with check (author_id = auth.uid() and is_community_staff(community_id));

create policy "community_posts_delete_own_or_staff" on community_posts for delete to authenticated
  using (author_id = auth.uid() or is_community_staff(community_id));

create table community_post_likes (
  post_id uuid references community_posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

alter table community_post_likes enable row level security;

create policy "community_post_likes_select_public" on community_post_likes for select
  using (true);
create policy "community_post_likes_insert_own" on community_post_likes for insert to authenticated
  with check (user_id = auth.uid());
create policy "community_post_likes_delete_own" on community_post_likes for delete to authenticated
  using (user_id = auth.uid());

-- Public bucket, same posture as the public select policy above -- a post
-- image is exactly as public as the post text it's attached to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-post-images', 'community-post-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "community_post_images_bucket_select_public" on storage.objects for select
  using (bucket_id = 'community-post-images');
create policy "community_post_images_bucket_insert_staff" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-post-images' and is_community_staff(((storage.foldername(name))[1])::uuid));

-- Reporting reuses the existing reports table/queue (0001_init.sql) rather
-- than inventing a parallel moderation path for exactly one content type.
alter table reports drop constraint reports_target_type_check;
alter table reports add constraint reports_target_type_check
  check (target_type in ('community', 'event', 'message', 'user', 'community_post'));
