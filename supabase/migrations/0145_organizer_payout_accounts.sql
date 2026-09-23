-- Organizer payout accounts -- the piece 0065's own payout system
-- deliberately deferred ("payout tracking, not automation": every ticket
-- payment lands in the platform's single Razorpay account, and forwarding
-- an organizer their share happened entirely outside the app, tracked only
-- via form_responses.payout_status/payout_marked_at). This introduces real
-- bank-account collection so that forwarding can actually be initiated
-- in-app, without disturbing the existing manual-tracking columns (kept
-- as-is, not touched by this migration).
--
-- One row per bank account an organizer has ever added -- never
-- overwritten in place (see is_active/is_primary below), so a historical
-- settlement can always point at the exact account it was paid out to,
-- even after the organizer later changes accounts.
create table organizer_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references auth.users(id) on delete cascade not null,
  account_holder_name text not null,
  -- AES-256-GCM ciphertext (iv + tag + ciphertext, base64), encrypted in
  -- application code (src/lib/bankEncryption.ts) with a server-only key
  -- (BANK_ENCRYPTION_KEY) before this row is ever written -- never a raw
  -- account number, and never decrypted anywhere except the one
  -- server-side call that needs to hand it to Razorpay for verification.
  account_number_encrypted text not null,
  -- Last 4 digits only, kept in the clear specifically so the UI can
  -- render "A/C ending ****1234" without ever decrypting the real number
  -- for display purposes.
  account_number_last4 text not null,
  ifsc text not null,
  bank_name text,
  verification_status text not null default 'not_verified'
    check (verification_status in ('not_verified', 'verification_pending', 'verified', 'verification_failed')),
  verification_failure_reason text,
  provider text not null default 'razorpay',
  provider_contact_id text,
  provider_fund_account_id text,
  provider_validation_id text,
  -- Only one account is ever "current" for an organizer at a time --
  -- adding a new account doesn't overwrite the old one (section 13/14 of
  -- the spec this was built from: existing settlements keep referencing
  -- whichever account they were actually paid to), it just supersedes it:
  -- the old row's is_active flips to false once the new one is added,
  -- is_primary flips to true only once the NEW account itself verifies
  -- (see saveOrganizerPayoutAccount's own comment for why it isn't primary
  -- immediately on creation).
  is_primary boolean not null default false,
  is_active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizer_payout_accounts_organizer_idx on organizer_payout_accounts(organizer_id);
-- At most one primary+active account per organizer at any time -- the
-- application enforces the supersede-on-add flow, this is the DB-level
-- backstop against two rows both claiming to be the current payout target.
create unique index organizer_payout_accounts_one_primary_idx on organizer_payout_accounts(organizer_id) where is_primary and is_active;

alter table organizer_payout_accounts enable row level security;

create policy "organizer_payout_accounts_select_own_or_admin" on organizer_payout_accounts for select to authenticated
  using (organizer_id = auth.uid() or is_admin());
-- No insert/update policy for `authenticated` at all -- same posture as
-- event_registration_refunds (0141): the account number must be encrypted
-- server-side before it ever reaches this table, and verification-status
-- transitions are system-driven (a Razorpay webhook, or a service-role
-- action after calling Razorpay), never a direct client write. Every
-- write goes through src/app/actions/organizerPayouts.ts via the admin
-- client, after its own requireUser()/ownership check.
