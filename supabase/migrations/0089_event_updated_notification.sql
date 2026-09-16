-- New notification type for updateEvent (app/actions/events.ts): every
-- registrant learns when the host changes an event's details (date, time,
-- venue, etc.) -- previously nothing told them a change had happened at
-- all short of revisiting the event page. Scoped to registrants only (not
-- the whole community/followers, unlike event-creation's own notification
-- types) since they're the ones with an actual stake in this specific
-- event already.
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
  'event_updated'
));
