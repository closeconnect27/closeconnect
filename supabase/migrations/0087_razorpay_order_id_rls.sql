-- form_responses_update_respondent_payment (0066) is scoped tightly to
-- exactly one transition (unpaid -> pending_verification, the manual-UPI
-- flow) -- its WITH CHECK requires the resulting row to have payment_status
-- = 'pending_verification', so createRazorpayOrderForRegistration's own
-- update (setting razorpay_order_id while the row stays 'unpaid') fails
-- that check and gets rejected as an RLS violation. This is a narrow,
-- separate policy for that: the registrant may attach a razorpay_order_id
-- to their own still-unpaid registration, but the row must still read
-- 'unpaid' afterward -- it does NOT let them flip payment_status to 'paid'
-- themselves (see verifyRazorpayPayment's own comment for why that
-- specific write goes through the service-role client instead: RLS can't
-- express "only if the HMAC signature actually checked out").
create policy "form_responses_update_respondent_razorpay_order" on form_responses for update to authenticated
  using (respondent_id = auth.uid() and owner_type = 'event' and payment_status = 'unpaid')
  with check (respondent_id = auth.uid() and owner_type = 'event' and payment_status = 'unpaid');
