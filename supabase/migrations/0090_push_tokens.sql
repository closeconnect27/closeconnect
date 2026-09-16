-- Device push tokens for the Capacitor Android (and later iOS) app --
-- registered client-side after the user grants notification permission and
-- the platform (FCM) hands back a token. One row per physical device/app
-- install, not per user -- a user can have several (multiple devices), and
-- a shared/re-logged-in device reassigns via the unique constraint on
-- `token` itself (upserted on conflict, see registerPushToken).
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on push_tokens(user_id);

alter table push_tokens enable row level security;

-- A device registers its own token for the signed-in user only -- the
-- upsert path (onConflict: 'token') needs both insert and update covered,
-- since a token already owned by a different user (device passed hands, or
-- a logout/login with a stale token) must be reassignable. `using (true)`
-- on update looks broad, but `token` is an opaque, high-entropy FCM string
-- (not enumerable/guessable), so reassignment requires already knowing the
-- exact token being displaced -- the `with check` is what actually matters,
-- keeping every row's final `user_id` pinned to the caller.
create policy "push_tokens_insert_self" on push_tokens for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_tokens_update_self" on push_tokens for update to authenticated
  using (true)
  with check (user_id = auth.uid());

create policy "push_tokens_select_own" on push_tokens for select to authenticated
  using (user_id = auth.uid());

create policy "push_tokens_delete_own" on push_tokens for delete to authenticated
  using (user_id = auth.uid());
