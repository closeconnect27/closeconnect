-- Community members currently only learn about a new event if they happen
-- to open the community's Broadcast circle (0076) -- no actual
-- notification fires. followed_new_event (0061) is a different audience
-- entirely (people who follow the HOST personally, not members of the
-- community the event belongs to), so this needs its own type, not reuse.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'claim_approved',
  'organizer_verified',
  'founding_marked',
  'event_message',
  'event_registered',
  'join_request_approved',
  'join_request_rejected',
  'join_request_pending',
  'new_follower',
  'follow_request_accepted',
  'followed_new_community',
  'followed_new_event',
  'payment_submitted',
  'payment_confirmed',
  'dm_received',
  'community_new_event'
));

-- Mirrors notify_followers_of_new_event's own insert/update-of-event_date
-- trigger split exactly, for the same reason: an event starts with a real
-- date at normal creation (insert-time trigger fires), or starts null via
-- duplicateEvent() and gets its first real date later via updateEvent
-- (update-time trigger fires instead); never both.
create function public.notify_members_of_new_community_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.community_id is null then
    return new;
  end if;

  insert into notifications (user_id, type, title, body, link)
  select cm.user_id, 'community_new_event', c.name || ' posted a new event', new.event_name, '/events/' || new.id
  from community_members cm
  join communities c on c.id = new.community_id
  where cm.community_id = new.community_id
    and cm.user_id != new.host_id;
  return new;
end;
$$;

create trigger notify_members_on_new_community_event_insert
  after insert on events
  for each row
  when (new.event_date is not null)
  execute function public.notify_members_of_new_community_event();

create trigger notify_members_on_new_community_event_update
  after update of event_date on events
  for each row
  when (new.event_date is not null and old.event_date is null)
  execute function public.notify_members_of_new_community_event();
