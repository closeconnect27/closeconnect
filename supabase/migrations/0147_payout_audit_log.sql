-- Append-only audit trail for the payout system, same shape/posture as
-- event_cancellation_audit_log (0142): who/what did what, when, for how
-- much -- never the sensitive bank details themselves (spec section 24:
-- "Never place full bank account numbers in audit logs" -- metadata here
-- only ever carries account_number_last4/bank_name, enforced by
-- logPayoutAudit's own callers, never the encrypted number or a decrypted
-- one).
create table payout_audit_log (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references auth.users(id) on delete cascade not null,
  payout_account_id uuid references organizer_payout_accounts(id) on delete set null,
  settlement_id uuid references organizer_settlements(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('organizer', 'admin', 'system')),
  action text not null check (action in (
    'account_added',
    'verification_started',
    'verification_succeeded',
    'verification_failed',
    'account_superseded',
    'settlement_computed',
    'payout_initiated',
    'payout_processed',
    'payout_failed',
    'payout_retried',
    'marked_paid_manually'
  )),
  amount_paise integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index payout_audit_log_organizer_idx on payout_audit_log(organizer_id, created_at desc);

alter table payout_audit_log enable row level security;

create policy "payout_audit_log_select_own_or_admin" on payout_audit_log for select to authenticated
  using (organizer_id = auth.uid() or is_admin());
-- No authenticated write policy -- service-role only (logPayoutAudit).
