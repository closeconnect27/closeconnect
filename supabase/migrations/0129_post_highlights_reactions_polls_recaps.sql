-- Four related community_posts extensions, all following the exact same
-- "public read, staff-only write" posture 0099 already established for the
-- feed itself.

-- Highlights: staff can pin a post to the top of their community's feed.
alter table community_posts add column is_pinned boolean not null default false;

-- Event recap posts: an optional link from a post back to the event it's
-- recapping -- nullable, no DB-level "event must have already happened"
-- check (same posture as meeting_link/venue requiredness: enforced at the
-- app layer, where a friendlier error belongs, not a raw constraint
-- violation).
alter table community_posts add column event_id uuid references events(id) on delete set null;
create index community_posts_event_idx on community_posts(event_id) where event_id is not null;

-- Reactions: replaces the single binary "like" (community_post_likes,
-- 0099) with a small fixed set of emoji reactions, one per user per post
-- (changing your reaction updates the row rather than adding a second
-- one). community_post_likes itself is left in place, not dropped --
-- existing rows are backfilled below as 'like' reactions; app code moves
-- to this table going forward.
create table community_post_reactions (
  post_id uuid references community_posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  reaction text not null check (reaction in ('like', 'love', 'laugh', 'wow', 'sad', 'clap')),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
create index community_post_reactions_post_idx on community_post_reactions(post_id);

alter table community_post_reactions enable row level security;
create policy "community_post_reactions_select_public" on community_post_reactions for select using (true);
create policy "community_post_reactions_insert_own" on community_post_reactions for insert to authenticated
  with check (user_id = auth.uid());
create policy "community_post_reactions_update_own" on community_post_reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "community_post_reactions_delete_own" on community_post_reactions for delete to authenticated
  using (user_id = auth.uid());

insert into community_post_reactions (post_id, user_id, reaction, created_at)
select post_id, user_id, 'like', created_at from community_post_likes
on conflict (post_id, user_id) do nothing;

-- Polls: a poll is always attached 1:1 to a post (the post's own `content`
-- doubles as the poll question -- no separate question column). Single-
-- choice only (the votes table's primary key is (poll_id, user_id), so a
-- second vote updates rather than adds). Every RLS check here traces back
-- to "you authored the post this poll belongs to" for writes, and the same
-- unconditional public read community_posts itself already has.
create table community_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade not null unique,
  closes_at timestamptz,
  created_at timestamptz default now()
);
alter table community_polls enable row level security;
create policy "community_polls_select_public" on community_polls for select using (true);
create policy "community_polls_insert_own_post" on community_polls for insert to authenticated
  with check (exists (select 1 from community_posts p where p.id = post_id and p.author_id = auth.uid()));

create table community_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references community_polls(id) on delete cascade not null,
  label text not null check (char_length(label) between 1 and 80),
  sort_order int not null default 0
);
create index community_poll_options_poll_idx on community_poll_options(poll_id, sort_order);
alter table community_poll_options enable row level security;
create policy "community_poll_options_select_public" on community_poll_options for select using (true);
create policy "community_poll_options_insert_own_poll" on community_poll_options for insert to authenticated
  with check (
    exists (
      select 1 from community_polls pl join community_posts p on p.id = pl.post_id
      where pl.id = poll_id and p.author_id = auth.uid()
    )
  );

create table community_poll_votes (
  poll_id uuid references community_polls(id) on delete cascade not null,
  option_id uuid references community_poll_options(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (poll_id, user_id)
);
create index community_poll_votes_option_idx on community_poll_votes(option_id);
alter table community_poll_votes enable row level security;
-- Vote counts/results are public (same posture as everything else here),
-- but WHO voted for WHAT isn't exposed by this alone -- select_public
-- returns every row including user_id, same visibility community_post_
-- reactions already has, so this matches an existing precedent rather than
-- introducing a new privacy posture.
create policy "community_poll_votes_select_public" on community_poll_votes for select using (true);
create policy "community_poll_votes_insert_own" on community_poll_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from community_polls pl where pl.id = poll_id and pl.closes_at is not null and pl.closes_at < now())
  );
create policy "community_poll_votes_update_own" on community_poll_votes for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (select 1 from community_polls pl where pl.id = poll_id and pl.closes_at is not null and pl.closes_at < now())
  );
