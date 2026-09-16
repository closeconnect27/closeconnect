-- Rename the two groups on_community_created() auto-creates for every
-- community: General -> Common Room, Announcements -> Broadcast (product
-- terminology change, no behavior change). Targeted by the flags that
-- creation set (is_default for the General-equivalent row, is_announcement
-- for the Announcements-equivalent row), not by name match alone -- a
-- host's own custom-named group that happened to collide with either old
-- default name is never touched.
update community_groups set name = 'Common Room' where name = 'General' and is_default = true;
update community_groups set name = 'Broadcast' where name = 'Announcements' and is_announcement = true;

-- Same two names for every community created from here on. Body otherwise
-- identical to 0024_claim_community.sql's version (the actual current one --
-- 0001_init.sql's original body was superseded there to guard the
-- external/unclaimed owner_id is null case).
create or replace function public.on_community_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_general_id uuid;
begin
  insert into community_groups (community_id, name, is_default)
  values (new.id, 'Common Room', true)
  returning id into v_general_id;

  insert into community_groups (community_id, name, is_announcement, is_default)
  values (new.id, 'Broadcast', true, false);

  if new.owner_id is not null then
    insert into community_members (community_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.owner_id from community_groups cg
    where cg.community_id = new.id and cg.is_default
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Lets a Broadcast message reference the event it's announcing, so the
-- chat UI can render it as a clickable event card instead of plain text.
-- Nullable/on delete set null -- an ordinary chat message never sets this,
-- and a deleted event shouldn't take its old announcement message down
-- with it (same reasoning as attachment_path staying put after a source
-- file is gone).
alter table community_messages add column event_id uuid references events(id) on delete set null;
create index community_messages_event_id_idx on community_messages(event_id) where event_id is not null;

-- Whenever a community-hosted event is published (created with a real
-- date, or a draft's date is set for the first time -- see getEvents'
-- own "null event_date = draft" rule this mirrors), auto-post it into
-- that community's Broadcast group. Keyed off is_announcement, not the
-- literal 'Broadcast' name, so a future rename never breaks this again.
create function public.broadcast_new_community_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
begin
  if new.community_id is null or new.event_date is null then
    return new;
  end if;

  -- Idempotency guard: this table has no unique constraint to lean on (an
  -- event could in principle get more than one broadcast-worthy update),
  -- so check for an existing message referencing this event instead of
  -- trying to distinguish "insert" from "first-publish update" by OLD/NEW
  -- comparison, which breaks once community_id itself can change later.
  if exists (select 1 from community_messages where event_id = new.id) then
    return new;
  end if;

  select id into v_group_id from community_groups
    where community_id = new.community_id and is_announcement = true
    limit 1;

  if v_group_id is not null then
    -- enforce_chat_rate_limit (0004) fires on this insert same as any
    -- chat message -- a host who just posted in Broadcast themselves, or
    -- who publishes two events back to back, could trip its 2-second
    -- window. This runs in the same transaction as the events insert/
    -- update, so an uncaught exception here would roll back the event
    -- creation itself. The broadcast is a side effect of publishing an
    -- event, not the point of it, so a failure here is swallowed rather
    -- than allowed to break that.
    begin
      insert into community_messages (group_id, user_id, content, event_id)
      values (v_group_id, new.host_id, '🎉 New event: ' || new.event_name, new.id);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

create trigger event_broadcast_on_publish
  after insert or update of event_date, community_id on events
  for each row execute function public.broadcast_new_community_event();
