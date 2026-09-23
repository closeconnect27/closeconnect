-- Append-only audit trail for the cancellation/refund system (0141).
-- form_responses/event_registration_refunds hold current-state summaries;
-- this table holds an immutable, chronological record of every
-- state-changing action across the whole feature -- who did what, when,
-- and for how much -- spanning policy edits (not tied to any single
-- registration) as well as per-registration cancellation/refund events.
-- Nothing here is ever updated or deleted once inserted.
create table event_cancellation_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  -- Null for a policy_updated entry -- that action isn't about any one
  -- registration. Every other action always has one.
  registration_id uuid references form_responses(id) on delete cascade,
  -- Who/what performed the action, not who it happened to (that's
  -- registration_id -> form_responses.respondent_id when relevant).
  -- Null actor_id + actor_role = 'system' is Razorpay's own webhook
  -- confirming a refund asynchronously, not a person clicking anything.
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('attendee', 'organizer', 'system')),
  action text not null check (action in (
    'policy_updated',
    'registration_cancelled',
    'event_cancelled',
    'refund_initiated',
    'refund_completed',
    'refund_failed'
  )),
  amount_paise integer,
  -- Freeform per-action detail (reason text, tier count, Razorpay refund
  -- id, etc.) -- deliberately jsonb rather than more dedicated columns:
  -- an audit log's whole point is to keep whatever context each action
  -- happened to have, not to force every action type into the same shape.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index event_cancellation_audit_log_event_idx on event_cancellation_audit_log(event_id, created_at desc);
create index event_cancellation_audit_log_registration_idx on event_cancellation_audit_log(registration_id);

alter table event_cancellation_audit_log enable row level security;

-- Same visibility as event_registration_refunds (0141): the event's host,
-- the registration's own respondent (when there is one), or an admin.
-- A policy_updated row (registration_id null) is host/admin-only, since
-- there's no respondent to check.
create policy "event_cancellation_audit_log_select_host_or_respondent" on event_cancellation_audit_log for select to authenticated
  using (
    is_event_host(event_id)
    or is_admin()
    or (registration_id is not null and exists (
      select 1 from form_responses fr where fr.id = event_cancellation_audit_log.registration_id and fr.respondent_id = auth.uid()
    ))
  );
-- No insert/update/delete policy for `authenticated` -- same posture as
-- event_registration_refunds: only the service-role client (the core
-- cancellation functions, cancelEventForHost, the refund webhook handler)
-- ever writes a row here, after its own authorization checks.
