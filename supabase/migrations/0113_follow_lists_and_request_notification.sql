-- URGENT FIX: 0110 (notify_host_of_new_registration) inserts a
-- notification of type 'event_new_registration' but never added that value
-- to notifications_type_check -- every insert into that table with this
-- type violates the check constraint, which as an AFTER TRIGGER on
-- form_responses rolls back the *entire triggering statement*. In practice
-- this has been silently breaking every free-ticket registration insert
-- (v_is_paid=false reaches the notification insert immediately) and every
-- paid registration's payment_status->'paid' transition (the UPDATE
-- trigger reaches the same insert) since 0110 was deployed. Fixing this
-- takes priority over the follow-list feature below it in this same file.
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
  'follow_request_received',
  'followed_new_community',
  'followed_new_event',
  'payment_submitted',
  'payment_confirmed',
  'dm_received',
  'community_new_event',
  'event_updated',
  'group_message',
  'event_new_registration'
));

-- Followers/following lists: the profile page wants to actually show these
-- lists (not just a "Follow" button), respecting the same visibility rule
-- as the rest of the profile (public/members_only/private+accepted-
-- request) -- profile_follows_select_own (0061) only lets the two
-- participants see a given row, which is right for "am I following this
-- person" but too narrow for "show me X's followers list" from a third
-- party. A profile_follows row serves both "followee's followers" and
-- "follower's following" queries, so either side's visibility unlocks it --
-- profile_visibility_allows (0035/0034) already implements the exact same
-- public/members_only/private+accepted-request rule used everywhere else,
-- reused here rather than duplicated. No `to authenticated` restriction --
-- profiles_select_public and profile_details_select are both readable by
-- anon visitors too for a public profile, so this matches.
create policy "profile_follows_select_visible" on profile_follows for select
  using (profile_visibility_allows(follower_id) or profile_visibility_allows(followee_id));

-- A follow REQUEST currently only notifies the requester once it's later
-- accepted (notify_follow_request_accepted, 0061) -- the target never
-- hears about the request arriving in the first place, so it just sits
-- unseen in IncomingFollowRequests until they happen to check.
create function public.notify_new_follow_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select new.target_id, 'follow_request_received', 'New follow request',
    p.display_name || ' wants to follow you', '/profile'
  from profiles p where p.id = new.requester_id;
  return new;
end;
$$;

create trigger notify_on_new_follow_request
  after insert on profile_follow_requests
  for each row execute function public.notify_new_follow_request();
