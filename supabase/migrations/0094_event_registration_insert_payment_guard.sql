-- Security audit finding (critical): form_responses_insert_event (0015) never
-- constrained payment_status at all -- registerForEvent/handleRegister (both
-- web and the new mobile app) always compute payment_status in APPLICATION
-- code (isPaid ? "unpaid" : "paid"), but RLS is the only real boundary
-- against a client that skips that code path entirely (a modified mobile
-- build, or a raw REST call carrying nothing but a valid access token). As
-- written, that client could INSERT a brand-new registration for a PAID
-- ticket type with payment_status = 'paid' from the very first write,
-- bypassing Razorpay completely -- a full payment bypass, not just a
-- theoretical RLS gap. This mirrors the same class of bug the update-side
-- policies (0066_upi_manual_payments, 0087_razorpay_order_id_rls) already
-- closed for UPDATEs; INSERT was simply missed.
--
-- Fix: payment_status = 'unpaid' is always insertable (the correct starting
-- state for any ticket, free or paid -- the free-ticket path immediately
-- follows up by flipping it, see below). payment_status = 'paid' is only
-- insertable when the ticket genuinely costs nothing (no ticket_type_id at
-- all, or a ticket_type_id whose price is 0) -- exactly the one case the
-- app already relies on being able to insert as 'paid' directly, since a
-- free ticket has no Razorpay step to run afterward. Any other value
-- ('pending_verification', 'failed') was never a legitimate INSERT-time
-- state and is now rejected outright.
drop policy "form_responses_insert_event" on form_responses;
create policy "form_responses_insert_event" on form_responses for insert to authenticated
  with check (
    owner_type = 'event'
    and status = 'approved'
    and respondent_id = auth.uid()
    and (
      payment_status = 'unpaid'
      or (
        payment_status = 'paid'
        and (
          ticket_type_id is null
          or exists (
            select 1 from event_ticket_types ett
            where ett.id = form_responses.ticket_type_id and ett.price = 0
          )
        )
      )
    )
  );
