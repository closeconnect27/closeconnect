-- Event RSVP & Attendance funnel, part 2: real Razorpay webhook work.
-- form_responses is the existing event-registration table (owner_type =
-- 'event') -- these two columns are meaningless for community join
-- requests (owner_type = 'community') and stay null there, same as
-- ticket_type_id already does.
alter table form_responses add column payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'paid', 'failed'));
alter table form_responses add column razorpay_payment_id text;

-- Free tickets (price = 0) were never meant to go through a payment flow
-- at all -- backfill existing free-ticket registrations to 'paid' so the
-- funnel dashboard (part 4) doesn't show them stuck at "unpaid" forever.
-- Paid-ticket registrations that predate this column stay 'unpaid'
-- (accurate: they really were never confirmed through a real payment
-- flow, since one didn't exist yet).
update form_responses fr
set payment_status = 'paid'
from event_ticket_types ett
where fr.owner_type = 'event' and fr.ticket_type_id = ett.id and ett.price = 0;
update form_responses set payment_status = 'paid' where owner_type = 'event' and ticket_type_id is null;

-- Idempotency for the webhook endpoint: Razorpay retries webhook
-- deliveries, and the same event id arriving twice must not double-apply
-- side effects. Recording every processed event id and checking it first
-- is the standard pattern -- more robust than inferring "already handled"
-- from payment_status alone (a payment_status check can't tell a genuine
-- second event for the same registration from a retry of the first).
create table razorpay_webhook_events (
  event_id text primary key,
  processed_at timestamptz default now()
);
-- RLS enabled with zero policies -- deny-all for anon/authenticated,
-- matching every other table in this schema rather than leaving one
-- table bare just because it's only ever touched by the service-role key
-- (which bypasses RLS regardless, so this doesn't affect the webhook
-- route handler's own access at all).
alter table razorpay_webhook_events enable row level security;
