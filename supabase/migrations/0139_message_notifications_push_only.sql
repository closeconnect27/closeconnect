-- "Message" notifications (a DM reply, a group chat message) no longer get
-- a persisted row in `notifications` -- they only ever fire the push. Every
-- OTHER notification type (follow requests, event updates, payment
-- confirmations, claim approvals, etc.) is unaffected and keeps showing up
-- in the in-app notification bell/list as before.
--
-- The push itself was only ever reachable via notifications_push_trigger
-- (0091), an AFTER INSERT trigger ON notifications -- there's no way to
-- fire a push WITHOUT inserting a row through that path. This factors the
-- trigger's own net.http_post call out into a standalone helper the four
-- message-notification functions below call directly, bypassing the
-- notifications table (and its trigger) entirely for this one category.
create or replace function public.send_push_only(p_user_id uuid, p_title text, p_body text, p_link text, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'link', p_link,
      'type', p_type
    )
  );
end;
$$;

-- Profile-to-profile DM (0123).
create or replace function public.on_profile_dm_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_thread record;
  v_recipient_id uuid;
begin
  select * into v_thread from profile_dm_threads where id = new.thread_id;

  if v_thread.status = 'pending' and new.sender_id = v_thread.recipient_id then
    update profile_dm_threads set status = 'accepted', last_message_at = new.created_at where id = new.thread_id;
  else
    update profile_dm_threads set last_message_at = new.created_at where id = new.thread_id;
  end if;

  v_recipient_id := case when new.sender_id = v_thread.requester_id then v_thread.recipient_id else v_thread.requester_id end;
  perform send_push_only(
    v_recipient_id,
    case when v_thread.status = 'pending' and new.sender_id = v_thread.requester_id then 'New message request' else 'New message' end,
    left(new.content, 120),
    '/messages/' || new.thread_id,
    'dm_received'
  );

  return new;
end;
$$;

-- Community DM + event DM (latest versions per 0116).
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
      perform send_push_only(
        v_owner_id, v_sender_name || ' sent you a message', v_community_name,
        '/communities/' || v_community_id || '?dmThread=' || new.thread_id, 'dm_received'
      );
    end if;
  else
    perform send_push_only(
      v_member_id, v_community_name || ' replied to you', left(new.content, 140),
      '/communities/' || v_community_id || '?dmThread=' || new.thread_id, 'dm_received'
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
      perform send_push_only(
        v_host_id, v_sender_name || ' sent you a message', v_event_name,
        '/events/' || v_event_id || '/manage?dmThread=' || new.thread_id, 'dm_received'
      );
    end if;
  else
    perform send_push_only(
      v_member_id, v_event_name || ' replied to you', left(new.content, 140),
      '/events/' || v_event_id || '?dmThread=' || new.thread_id, 'dm_received'
    );
  end if;

  return new;
end;
$$;

-- Group chat (0093) -- fans out to every OTHER member, so this loops
-- instead of the single-recipient call the three DM triggers above use.
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
  v_member record;
begin
  select cg.community_id, cg.name into v_community_id, v_group_name
  from community_groups cg where cg.id = new.group_id;

  select display_name into v_sender_name from profiles where id = new.user_id;

  for v_member in
    select cgm.user_id from community_group_members cgm
    where cgm.group_id = new.group_id and cgm.user_id != new.user_id
  loop
    perform send_push_only(
      v_member.user_id,
      v_sender_name || ' in ' || v_group_name,
      left(new.content, 140),
      '/communities/' || v_community_id || '/groups/' || new.group_id,
      'group_message'
    );
  end loop;

  return new;
end;
$$;
