-- New notification types this feature needs, added in the SAME migration
-- that starts inserting them (0141's own comment documents why: a CHECK
-- constraint violation silently rolls back the whole inserting statement,
-- not just the notification insert, if this is ever split into a later
-- migration).
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
  'event_new_registration',
  'event_cancelled',
  'registration_cancelled',
  'refund_processed',
  'refund_failed',
  'event_registration_cancelled',
  'payout_account_verified',
  'payout_processed',
  'payout_failed'
));
