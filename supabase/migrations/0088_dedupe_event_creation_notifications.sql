-- New-event creation can currently fan out TWO notifications to the same
-- person about the exact same event: notify_followers_of_new_event (0061,
-- "X is hosting a new event", to anyone following the host) and
-- notify_members_of_new_community_event (0078, "X posted a new event", to
-- every member of the event's community) -- whenever someone is both a
-- follower of the host AND a member of that community, which is the common
-- case for an active community's own members. Rather than drop either
-- audience (followers-without-community-membership and
-- community-members-without-a-follow both still need to hear about it),
-- the community trigger now excludes anyone who's already getting the
-- follow-based notification, keeping exactly one per recipient. Mirrors
-- notify_followers_of_new_event's own follower-lookup (profile_follows
-- direct + profile_follow_requests accepted) exactly, so "already
-- notified" here means the same thing it means there.
create or replace function public.notify_members_of_new_community_event()
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
    and cm.user_id != new.host_id
    and not exists (
      select 1 from profile_follows pf where pf.follower_id = cm.user_id and pf.followee_id = new.host_id
      union
      select 1 from profile_follow_requests pfr where pfr.requester_id = cm.user_id and pfr.target_id = new.host_id and pfr.status = 'accepted'
    );
  return new;
end;
$$;
