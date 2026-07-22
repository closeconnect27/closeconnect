-- Community "Type" (online/offline/both) is removed entirely -- unlike an
-- event (where "online" genuinely changes what a registrant needs: a
-- meeting link instead of a venue), a community's type never drove any
-- actual behavior, just an unused filter. Dropping the column outright --
-- every app-level reference (create form, filter bar, card badge, detail
-- page) is removed in this same change, not left dormant.
alter table communities drop column community_type;

-- Events gain the equivalent, more meaningful concept: offline (default,
-- matches every existing event's implicit assumption) or online.
alter table events add column event_mode text not null default 'offline' check (event_mode in ('online', 'offline'));

-- Meeting link lives on its own table, not a plain column on events.
-- events_select_active_or_own (0001_init.sql) is public/anon-readable for
-- any active event, and Postgres row-level security is exactly that --
-- row-level, not column-level: a column added directly to events would be
-- exposed to every visitor regardless of which query selects it. A
-- separate table with its own restrictive RLS (mirroring
-- form_responses_select_owner_or_respondent's "host or the specific
-- person it's for" pattern) is the only way to actually keep it private.
create table event_meeting_links (
  event_id uuid primary key references events(id) on delete cascade,
  meeting_link text not null,
  updated_at timestamptz default now()
);
alter table event_meeting_links enable row level security;

-- Only the host, or someone with a confirmed (paid) registration for this
-- exact event, can ever read the link -- "only registered users should
-- receive the meeting link." payment_status = 'paid' covers both a free
-- ticket (marked paid immediately, 0041) and a paid ticket once the host
-- has manually confirmed it (0066) -- an unpaid/pending registration
-- doesn't count as "registered" yet.
create policy "event_meeting_links_select_authorized" on event_meeting_links for select to authenticated
  using (
    is_event_host(event_id)
    or exists (
      select 1 from form_responses fr
      where fr.owner_type = 'event' and fr.owner_id = event_id
        and fr.respondent_id = auth.uid() and fr.payment_status = 'paid'
    )
  );

create policy "event_meeting_links_insert_host" on event_meeting_links for insert to authenticated
  with check (is_event_host(event_id));

create policy "event_meeting_links_update_host" on event_meeting_links for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));

create policy "event_meeting_links_delete_host" on event_meeting_links for delete to authenticated
  using (is_event_host(event_id));
