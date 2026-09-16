-- Both DM notification triggers (community 0067, event 0074) only ever
-- linked to the community/event as a whole, never the specific thread --
-- fine for the click-through (the inbox is right there), but it meant
-- mobile's "don't push if I'm already looking at this" suppression
-- (activeChatRoute) could only match on "some DM screen for this
-- community/event is open," not "this specific thread" -- so staff with
-- ANY one thread (or even just the inbox list) open had EVERY other
-- attendee's/member's DM silently suppressed, not just the one they were
-- actually viewing. event_dm's host-recipient direction already carried
-- `?dmThread=` (0074) for NotificationBell's deep-link; this extends the
-- same param to the one direction that was missing it there (member-
-- recipient) and to both directions of community DM, so the client side
-- can tighten suppression to per-thread instead of per-community/event.
create or replace function public.notify_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_community_id uuid;
  v_owner_id uuid;
  v_community_name text;
  v_sender_name text;
begin
  select member_id, community_id into v_member_id, v_community_id
  from community_dm_threads where id = new.thread_id;

  select owner_id, name into v_owner_id, v_community_name
  from communities where id = v_community_id;

  if new.sender_id = v_member_id then
    if v_owner_id is not null then
      select display_name into v_sender_name from profiles where id = new.sender_id;
      insert into notifications (user_id, type, title, body, link)
      values (
        v_owner_id, 'dm_received', v_sender_name || ' sent you a message', v_community_name,
        '/communities/' || v_community_id || '?dmThread=' || new.thread_id
      );
    end if;
  else
    insert into notifications (user_id, type, title, body, link)
    values (
      v_member_id, 'dm_received', v_community_name || ' replied to you', left(new.content, 140),
      '/communities/' || v_community_id || '?dmThread=' || new.thread_id
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_event_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_event_id uuid;
  v_host_id uuid;
  v_event_name text;
  v_sender_name text;
begin
  select member_id, event_id into v_member_id, v_event_id
  from event_dm_threads where id = new.thread_id;

  select host_id, event_name into v_host_id, v_event_name
  from events where id = v_event_id;

  if new.sender_id = v_member_id then
    if v_host_id is not null then
      select display_name into v_sender_name from profiles where id = new.sender_id;
      insert into notifications (user_id, type, title, body, link)
      values (
        v_host_id, 'dm_received', v_sender_name || ' sent you a message', v_event_name,
        '/events/' || v_event_id || '/manage?dmThread=' || new.thread_id
      );
    end if;
  else
    insert into notifications (user_id, type, title, body, link)
    values (
      v_member_id, 'dm_received', v_event_name || ' replied to you', left(new.content, 140),
      '/events/' || v_event_id || '?dmThread=' || new.thread_id
    );
  end if;

  return new;
end;
$$;
