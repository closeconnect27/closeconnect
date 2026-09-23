-- Itemized add-on refunds + ticket/add-on settlement breakdown. Two gaps
-- left after 0153 shipped the add-on system itself:
--
-- 1. Cancellation only ever refunded a flat percentage of a registration's
--    *combined* amount_paid_paise (ticket + add-ons together) -- there was
--    no way to keep a ticket active while refunding just one add-on, and
--    no way for a host to mark an add-on non-refundable regardless of the
--    event's own cancellation-policy tier (e.g. a printed T-shirt that's
--    already been produced).
-- 2. organizer_settlements (0146) only stored one blended gross/refund
--    number -- an organizer/admin financial view couldn't tell how much of
--    an event's revenue was tickets vs add-ons.

-- Per-add-on refundability, set by the host alongside price/inventory.
-- Default true (subject to the event's own cancellation policy tier) --
-- an add-on only becomes unconditionally non-refundable when a host
-- explicitly flips this, matching the spec's "required must never be the
-- default" posture applied to refundability instead.
alter table event_addons add column is_refundable boolean not null default true;

-- Per-line refund tracking on a purchased add-on -- mirrors form_responses'
-- own refund_amount_paise/status split, at the line-item level. All-or-
-- nothing per line (not fractional within one line item), matching the
-- spec's own REFUNDED example: a host either refunds a specific purchased
-- add-on or doesn't.
alter table form_response_addons add column refund_amount_paise integer not null default 0 check (refund_amount_paise >= 0);
alter table form_response_addons add column status text not null default 'active' check (status in ('active', 'refunded'));

-- Ticket vs add-on revenue/refund, split out from the single blended
-- gross_sales_paise/refund_amount_paise columns 0146 shipped with --
-- those two stay as the authoritative totals (ticket_revenue_paise +
-- addon_revenue_paise must always sum to gross_sales_paise; likewise for
-- the refund pair), these are purely an additional reporting breakdown.
alter table organizer_settlements add column ticket_revenue_paise bigint not null default 0;
alter table organizer_settlements add column addon_revenue_paise bigint not null default 0;
alter table organizer_settlements add column ticket_refund_paise bigint not null default 0;
alter table organizer_settlements add column addon_refund_paise bigint not null default 0;
