-- New notification type for cancelEvent's now-fixed registrant notification
-- (audit found it previously sent none at all, breaking the explicit
-- promise on /cancellation-refund). Learned the hard way earlier this
-- session (0110/0113): a new `type` value used by app code MUST be added
-- here in the same breath, or every insert using it violates this check
-- constraint and silently rolls back its entire triggering statement.
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
  'event_cancelled'
));
