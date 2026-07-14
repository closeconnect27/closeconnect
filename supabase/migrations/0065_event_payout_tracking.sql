-- Payout tracking (not automation): CloseConnect runs one platform-wide
-- Razorpay account (src/lib/razorpay.ts) -- every ticket payment lands
-- there regardless of host, and forwarding a host their share happens
-- entirely outside the app (bank transfer/UPI, by hand). This just tracks
-- which paid registrations have actually been forwarded yet, so a host
-- (or admin) can see what's still owed instead of reconstructing it from
-- the registrant list every time. Mirrors payment_status's own shape
-- (0041) -- meaningless for owner_type='community' rows, same as
-- payment_status/ticket_type_id already are.
alter table form_responses add column payout_status text not null default 'pending'
  check (payout_status in ('pending', 'paid_out'));
alter table form_responses add column payout_marked_at timestamptz;

-- Only a row where real money was actually collected (payment_status =
-- 'paid' AND a real, non-zero-price ticket) should ever show as owed --
-- a $0 ticket's payment_status is set to 'paid' too (0041's own
-- backfill, purely for the funnel display's sake), but no money moved
-- through Razorpay for it, so nothing is owed. Everything else
-- (unpaid/failed, free tickets, legacy pre-ticket-type rows) is backfilled
-- straight to paid_out so existing hosts don't see a payout owed for
-- money that was never collected or was already settled before this
-- column existed.
update form_responses fr
set payout_status = 'paid_out', payout_marked_at = now()
where fr.owner_type = 'event'
and not (
  fr.payment_status = 'paid'
  and exists (select 1 from event_ticket_types ett where ett.id = fr.ticket_type_id and ett.price > 0)
);
