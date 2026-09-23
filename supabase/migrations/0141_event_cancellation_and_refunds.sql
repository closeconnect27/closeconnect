-- Full attendee-initiated cancellation/refund system for event
-- registrations. Nothing here existed before: an attendee had no way at
-- all to cancel a registration (form_responses.status only ever went
-- 'pending'/'approved'/'rejected'), and cancelEventForHost (organizer
-- cancels the whole event) notified registrants but never touched payment
-- state at all despite /cancellation-refund explicitly promising a full
-- refund in that case.

-- =========================================================================
-- CANCELLATION POLICY (per event, organizer-configurable)
-- =========================================================================
-- One row per event. Absence of a row (the common case for every event
-- that predates this migration, and any new event whose host never opens
-- the settings) means "use the default policy" -- the exact >48h
-- full-refund / <48h non-refundable rule /cancellation-refund already
-- promises -- rather than silently promising nothing or silently
-- promising everything. That default lives in application code
-- (src/lib/eventCancellation.ts), not duplicated here, so the two can
-- never drift apart.
--
-- rules is a JSON array of {hours_before, refund_percentage} tiers, same
-- shape/spirit as TheHotSpots' cancellation_policies.rules this same
-- session -- deliberately not a child table: a policy's rules are always
-- read and written as one unit (there's no query that needs "all rules
-- above X%" across events), and this is also exactly what gets copied
-- byte-for-byte into a registration's snapshot below, so keeping both as
-- the same jsonb shape means the snapshot is just "copy this column."
create table event_cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null unique,
  -- false = "Non-refundable" (section 5): no rule is evaluated, no amount
  -- is ever refunded, regardless of what's in `rules`.
  enabled boolean not null default true,
  rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table event_cancellation_policies enable row level security;

create policy "event_cancellation_policies_select_public" on event_cancellation_policies for select using (true);

create policy "event_cancellation_policies_host_manage" on event_cancellation_policies for all to authenticated
  using (is_event_host(event_id))
  with check (is_event_host(event_id));

-- =========================================================================
-- REGISTRATION-SIDE CANCELLATION/REFUND STATE
-- =========================================================================
-- 'cancelled' is a genuinely new terminal status, not a repurposing of
-- 'rejected' (that means "the host rejected your request", a different
-- thing entirely for the audience-gated form flow this same status column
-- already serves). enforce_ticket_capacity() below is updated to exclude
-- it from its sum -- that's the entire "restore inventory" mechanism: since
-- capacity was never a decrementing counter to begin with (0119's comment),
-- a cancelled row just needs to stop counting, nothing needs to be added
-- back anywhere.
alter table form_responses drop constraint form_responses_status_check;
alter table form_responses add constraint form_responses_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table form_responses add column cancelled_at timestamptz;
alter table form_responses add column cancelled_by text check (cancelled_by in ('attendee', 'organizer'));
alter table form_responses add column cancellation_reason text;

-- The event's cancellation policy AT THE MOMENT this registration was
-- created (section 6) -- calculateCancellationRefund always reads this,
-- never the event's live event_cancellation_policies row, so an organizer
-- editing their policy later can never retroactively change what an
-- existing attendee is entitled to. Null here (any registration made
-- before this migration, or made while the event genuinely had no
-- configured policy) falls back to the same application-level default the
-- policy table's own absence falls back to -- there is no meaningful
-- difference between "no policy existed yet" and "no policy row exists",
-- so both resolve the same way.
alter table form_responses add column cancellation_policy_snapshot jsonb;

-- The amount actually captured by Razorpay for this registration, in
-- paise -- populated once (in verifyRazorpayPayment and the payment
-- webhook, at the exact moment payment_status flips to 'paid') rather than
-- recomputed from event_ticket_types.price * quantity at refund time.
-- Both happen to agree today (0120 freezes ticket prices the instant any
-- registration exists), but storing the actual charged amount as its own
-- durable fact is the tamper-safe version section 21/41 asks for, and
-- costs nothing extra to maintain.
alter table form_responses add column amount_paid_paise integer;

alter table form_responses add column refund_status text not null default 'none' check (refund_status in ('none', 'pending', 'processing', 'processed', 'failed'));
alter table form_responses add column refund_amount_paise integer;
alter table form_responses add column cancellation_charge_paise integer;
-- Set on the FIRST refund attempt for this registration and never
-- overwritten again -- the idempotency guard cancelMyRegistration checks
-- before ever calling Razorpay a second time for the same registration
-- (see that action's own comment).
alter table form_responses add column razorpay_refund_id text;

-- =========================================================================
-- REFUND LEDGER (audit trail -- form_responses above holds the current
-- summary, this table holds the append-only history, same split TheHotSpots
-- uses this same session between payments' summary columns and its own
-- refunds table)
-- =========================================================================
create table event_registration_refunds (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references form_responses(id) on delete cascade not null,
  amount_paise integer not null check (amount_paise >= 0),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  razorpay_refund_id text,
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index event_registration_refunds_registration_idx on event_registration_refunds(registration_id);

alter table event_registration_refunds enable row level security;

create policy "event_registration_refunds_select_own_or_host" on event_registration_refunds for select to authenticated
  using (exists (
    select 1 from form_responses fr
    join events e on e.id = fr.owner_id
    where fr.id = event_registration_refunds.registration_id
      and fr.owner_type = 'event'
      and (fr.respondent_id = auth.uid() or e.host_id = auth.uid() or is_admin())
  ));
-- No insert/update policy for `authenticated` at all -- same posture as
-- razorpay_webhook_events (0041) and payments-adjacent tables generally:
-- only the service-role client (cancelMyRegistration, cancelEventForHost,
-- the refund webhook handler) ever writes a refund record, after its own
-- signature/ownership checks, never a direct client write.

-- =========================================================================
-- INVENTORY: exclude cancelled registrations from the capacity check
-- =========================================================================
create or replace function public.enforce_ticket_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_capacity integer;
  v_registered integer;
begin
  if new.owner_type <> 'event' or new.ticket_type_id is null then
    return new;
  end if;

  select quantity_available into v_capacity from event_ticket_types where id = new.ticket_type_id;
  if v_capacity is null then
    return new; -- unlimited
  end if;

  perform pg_advisory_xact_lock(hashtext(new.ticket_type_id::text));

  select coalesce(sum(quantity), 0) into v_registered from form_responses
  where owner_type = 'event' and ticket_type_id = new.ticket_type_id and status <> 'cancelled';

  if v_registered + new.quantity > v_capacity then
    raise exception 'This ticket type is sold out.';
  end if;

  return new;
end;
$$;

-- =========================================================================
-- NOTIFICATIONS: new types this feature needs
-- =========================================================================
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
  'event_registration_cancelled'
));
