-- Defense-in-depth for broadcast_new_community_post (0112): adds the same
-- "already posted about this row" guard broadcast_new_community_event
-- (0076) already has. The real fix for the double-broadcast bug this
-- session was a client-side race (the mobile app's Post button wasn't
-- disabled until after an async flush, so a double-tap could insert two
-- real community_posts rows) -- this guard doesn't fix that, but makes the
-- broadcast side idempotent regardless of how a duplicate row happens to
-- occur (a retried request, a future bug, etc.), same posture as the event
-- version.
create or replace function public.broadcast_new_community_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
begin
  if exists (select 1 from community_messages where post_id = new.id) then
    return new;
  end if;

  select id into v_group_id from community_groups
    where community_id = new.community_id and is_announcement = true
    limit 1;

  if v_group_id is not null then
    begin
      insert into community_messages (group_id, user_id, content, post_id)
      values (v_group_id, new.author_id, '📰 New post', new.id);
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;
