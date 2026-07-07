-- Analytics tracking infrastructure (Phase 11 Section 5). No historical
-- view data exists today, only current-state counts -- this is new
-- write-path infra; the dashboard reading it comes later, once tracking has
-- actually been live long enough to have something worth looking at.
create table page_views (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('community','event')),
  target_id uuid not null,
  viewer_id uuid references profiles(id),
  viewer_session text not null,
  viewed_on date not null default current_date,
  created_at timestamptz default now(),
  unique (target_type, target_id, viewer_session, viewed_on)
);
create index page_views_target_idx on page_views(target_type, target_id, viewed_on);

alter table page_views enable row level security;

-- Anonymous viewing counts -- insert is open to everyone, same posture as
-- event registration used to have before that required accounts: viewing a
-- page isn't a privileged action, and requiring auth to even count a view
-- would undercount every anonymous visitor, which is most of them.
create policy "page_views_insert_public" on page_views for insert
  with check (true);

-- Select is the opposite: view counts are private, same privacy posture as
-- form_responses (a host/owner shouldn't leak how many people looked at a
-- listing to competitors, and a viewer shouldn't be able to enumerate who
-- else viewed something via their own session).
create policy "page_views_select_owner_or_host" on page_views for select to authenticated
  using (
    is_admin()
    or (target_type = 'community' and is_community_staff(target_id))
    or (target_type = 'event' and is_event_host(target_id))
  );
