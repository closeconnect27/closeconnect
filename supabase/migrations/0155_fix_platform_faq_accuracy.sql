-- Three platform_faqs answers seeded by 0152 no longer match actual behavior
-- (a production-readiness audit flagged these as literally false/misleading):
--   - "How do I sign in?" only described the magic-link fallback; Google
--     Sign-In has since become the primary, required path (see login/page.tsx).
--   - "How does CloseConnect verify organizers?" described the old manual
--     admin-review flow, which 0060 replaced with fully automatic
--     verification (owning a community or hosting one event verifies you).
--   - "How do organizer payouts work?" said "automatically" without
--     qualifying that a payout only runs when the host opens Payments &
--     Payouts (there's no cron -- see organizerSettlement.ts).
-- Matched by question text since these are the same rows 0152 inserted,
-- not new ones -- if an admin has since edited these via /admin/faqs this
-- is a no-op for that row (update affects 0 rows, doesn't error).
update platform_faqs set answer =
  'Sign in with Google -- it''s the fastest, most secure option and works everywhere an account is needed. If you''d rather not use Google, you can enter your email instead and we''ll send you a one-time sign-in link.'
  where question = 'How do I sign in?';

update platform_faqs set answer =
  'Verification is automatic, not something you apply for -- as soon as you host your first event or own a community, your profile and events get a verified badge.'
  where question = 'How does CloseConnect verify organizers?';

update platform_faqs set answer =
  'Once your event has happened, opening your Host Dashboard''s Payments & Payouts page calculates your net earnings (ticket sales less any refunds and gateway charges) and settles them to your verified payout account. Payouts run when you visit that page, so check in there after your event ends.'
  where question = 'How do organizer payouts work?';
