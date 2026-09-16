-- Narrows group-chat notifications (0093) to staff-sent messages only --
-- a notification for every single member's chatter turned out to be too
-- noisy; the signal worth surfacing is specifically "the host/an admin
-- said something in this group," not every back-and-forth between
-- ordinary members. Ordinary members' messages still update
-- community_group_reads-based unread counts/badges as normal (that
-- mechanism doesn't depend on this notifications-table trigger at all) --
-- this only narrows the notification-bell/push-notification signal.
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
  v_sender_role text;
begin
  select cg.community_id, cg.name into v_community_id, v_group_name
  from community_groups cg where cg.id = new.group_id;

  select role into v_sender_role from community_members
  where community_id = v_community_id and user_id = new.user_id;

  if v_sender_role not in ('owner', 'moderator') then
    return new;
  end if;

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
