-- Standard Checkout (create-order -> client modal -> verify-signature) needs
-- to correlate the order it created with the registration it belongs to
-- when the signature-verification step comes back -- razorpay_payment_id
-- (0041) alone isn't enough since that's only known *after* payment, and
-- the verify step must confirm the order_id it received matches the one
-- this registration actually requested (never trust a client-supplied
-- order_id blindly). Meaningless for owner_type='community' rows, same as
-- payment_status/razorpay_payment_id/ticket_type_id already are.
alter table form_responses add column razorpay_order_id text;
