-- Group chat (community_messages) never notified anyone at all -- only its
-- rate-limit trigger existed (0004). DMs (community_dm_message_notify,
-- 0067) and event DMs (event_dm_message_notify, 0074) already did; this is
-- the one remaining gap for "every message in the app should notify",
-- fanning out to every OTHER member of the group (not the sender) rather
-- than a single counterpart the way a 1:1 DM does.
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
  'community_new_event',
  'event_updated',
  'group_message'
));

-- Cross-user (every member besides the sender), so security definer, same
-- convention as notify_dm_message -- no single member's own RLS-scoped
-- client could insert a notification for anyone else.
create or replace function public.notify_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_group_name text;
  v_sender_name text;
begin
  select cg.community_id, cg.name into v_community_id, v_group_name
  from community_groups cg where cg.id = new.group_id;

  select display_name into v_sender_name from profiles where id = new.user_id;

  insert into notifications (user_id, type, title, body, link)
  select
    cgm.user_id,
    'group_message',
    v_sender_name || ' in ' || v_group_name,
    left(new.content, 140),
    '/communities/' || v_community_id || '/groups/' || new.group_id
  from community_group_members cgm
  where cgm.group_id = new.group_id
    and cgm.user_id != new.user_id;

  return new;
end;
$$;

create trigger community_messages_notify
  after insert on community_messages
  for each row execute function public.notify_group_message();
