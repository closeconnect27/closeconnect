-- Captured once, at the same moment amount_paid_paise is (payment
-- confirmation, either path: verifyRazorpayPayment or the payment.captured
-- webhook) -- the actual Razorpay gateway fee for this specific payment,
-- so organizerSettlement.ts can deduct the real per-transaction charge
-- (terms/page.tsx's own promise: "less any payment gateway processing
-- charges") instead of an estimated percentage or a live lookup at
-- settlement time. Null for a free registration (nothing was ever charged)
-- or if the fee lookup itself failed at confirmation time (treated as 0 by
-- the settlement calculation, not blocking).
alter table form_responses add column gateway_fee_paise integer;
