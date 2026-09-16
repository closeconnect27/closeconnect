-- Extends the Broadcast-group auto-post pattern (0076, event publish) to
-- feed posts: a new community_posts row now also auto-posts into that
-- community's Broadcast group, same "announce staff activity publicly"
-- idea. A single AFTER INSERT trigger (not insert-or-update like 0076's
-- event version) is enough here -- a post has no draft/later-published
-- state, it's fully formed the moment it's created.
alter table community_messages add column post_id uuid references community_posts(id) on delete set null;
create index community_messages_post_id_idx on community_messages(post_id) where post_id is not null;

create function public.broadcast_new_community_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from community_groups
    where community_id = new.community_id and is_announcement = true
    limit 1;

  if v_group_id is not null then
    -- Same rate-limit/failure-swallowing reasoning as
    -- broadcast_new_community_event (0076): the post is the point of this
    -- insert, the broadcast is a side effect, so a failure here (e.g. the
    -- 2-second chat rate limit trigger) must never roll the post back.
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

create trigger post_broadcast_on_publish
  after insert on community_posts
  for each row execute function public.broadcast_new_community_post();
