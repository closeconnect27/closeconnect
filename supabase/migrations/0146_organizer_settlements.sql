-- Per-event settlement ledger -- the correctly-computed replacement for
-- getPayoutSummary's naive "price * quantity, no refund awareness, no
-- platform fee" estimate (src/lib/queries/payouts.ts). One row per event,
-- computed on demand (computeEventSettlement in
-- src/lib/organizerSettlement.ts) whenever an organizer/admin views their
-- payments dashboard, or whenever a registration's paid/refund state
-- changes for that event -- there's no cron in this app's Cloudflare
-- Workers deployment, so "recompute on read plus recompute at the moments
-- money actually moves" is this feature's actual settlement schedule
-- (spec section 18: "if no settlement schedule exists, implement a
-- configurable mechanism" -- this is that mechanism, and it's explicit in
-- code, not implied).
create table organizer_settlements (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references auth.users(id) on delete cascade not null,
  event_id uuid references events(id) on delete cascade not null unique,
  -- Snapshot reference -- kept even if the organizer later adds a new
  -- payout account, so a completed settlement always shows which account
  -- it was actually paid to (section 14).
  payout_account_id uuid references organizer_payout_accounts(id),
  gross_sales_paise integer not null default 0,
  refund_amount_paise integer not null default 0,
  platform_fee_paise integer not null default 0,
  net_payable_paise integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'eligible', 'processing', 'processed', 'failed', 'on_hold')),
  provider text not null default 'razorpay',
  provider_payout_id text,
  failure_reason text,
  initiated_at timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizer_settlements_organizer_idx on organizer_settlements(organizer_id);

alter table organizer_settlements enable row level security;

create policy "organizer_settlements_select_own_or_admin" on organizer_settlements for select to authenticated
  using (organizer_id = auth.uid() or is_admin());
-- No authenticated write policy -- same posture as organizer_payout_accounts
-- and event_registration_refunds: only computeEventSettlement/
-- initiateOrganizerPayout (service-role, after their own authorization
-- checks) ever write here.
