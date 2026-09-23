-- Initial platform FAQ content (spec section 31) -- database-driven, not
-- hardcoded into a component/template, so an admin can edit/reorder/
-- unpublish any of these from /admin/faqs without a code deploy. Every
-- answer here describes an actually-implemented behavior (magic-link sign
-- in, the real cancellation-policy/refund mechanics, the real payout flow
-- just shipped, etc.) -- nothing promises a feature that doesn't exist.
insert into platform_faqs (question, answer, category, display_order) values
('What is CloseConnect?', 'CloseConnect is a platform for discovering, hosting, and joining local events and communities -- from meetups and workshops to ticketed shows.', 'getting_started', 0),
('How does CloseConnect work?', 'Browse events and communities near you, register or join for free, and pay for ticketed events through our secure checkout. You can also host your own events and start communities.', 'getting_started', 1),
('Do I need an account to browse events?', 'You can browse public events and communities without an account, but you''ll need to sign in to register for an event, join a community, message someone, or host your own event.', 'getting_started', 2),

('How do I sign in?', 'Enter your email on the login page and we''ll send you a one-time sign-in link -- no password to remember.', 'account', 0),
('How do I edit my profile?', 'Go to Profile, then Edit profile, to update your name, photo, and other details.', 'account', 1),
('Can I delete my account?', 'Yes -- account deletion is available from your profile settings. See our Account Deletion page for what happens to your data.', 'account', 2),

('How do I discover events?', 'Open the Events tab and filter by city or category, or browse the communities you''ve joined for events they''re hosting.', 'events', 0),
('How do I host an event?', 'Tap Create, then Host an event, and fill in the details, date, location or online link, and ticket types. You can publish it right away.', 'events', 1),
('Can I edit an event after publishing?', 'Yes, up until the event starts. Once someone has registered, ticket types and registration questions lock so existing registrants aren''t affected -- everything else stays editable.', 'events', 2),

('How do I access my ticket?', 'Go to the event page or My events -- your ticket is available to view or download there once your registration is confirmed.', 'tickets', 0),
('Where can I see my bookings?', 'Your Profile has a My events section listing everything you''re registered for, upcoming and past.', 'tickets', 1),
('Can I transfer my ticket to someone else?', 'Not currently -- a ticket is tied to the account that registered it.', 'tickets', 2),

('What payment methods are supported?', 'Ticketed events are paid for through Razorpay, which supports cards, UPI, netbanking, and popular wallets.', 'payments', 0),
('How do I know my payment was successful?', 'You''ll get an in-app notification and a confirmation email, and the event will show as confirmed in My events.', 'payments', 1),
('Where can I find my payment receipt?', 'Razorpay emails a receipt for every successful payment, and your registration''s confirmation email has the same details.', 'payments', 2),

('Can I cancel my ticket?', 'Yes -- open your registration on the event page and choose Cancel booking. Any refund follows that event''s cancellation policy, shown before you pay.', 'cancellation_refunds', 0),
('How is my refund calculated?', 'Each event has a cancellation policy set by its organizer (or our default: full refund more than 48 hours before the event, none after). The policy shown to you at booking time is what applies, even if the organizer changes it later.', 'cancellation_refunds', 1),
('When will I receive my refund?', 'Refunds are typically processed within 5-7 business days, depending on your bank or payment provider''s own processing time.', 'cancellation_refunds', 2),

('How do I become an event organizer?', 'Anyone with an account can host -- there''s no separate application. Just tap Create, then Host an event.', 'organizers', 0),
('How do organizer payouts work?', 'Once your event has happened and you have a verified payout account, your net earnings (ticket sales less any refunds and gateway charges) are settled to your bank account automatically.', 'payouts', 0),
('Where do I add my bank details?', 'From your Host Dashboard, open Payments & Payouts to add and verify your payout account.', 'payouts', 1),

('How does CloseConnect verify organizers?', 'Organizers can go through a verification review, after which their profile and events display a verified badge.', 'safety', 0),
('What should I do if I have an issue with an event?', 'You can report the event or contact support@closeconnect.in and our team will help sort it out.', 'safety', 1);
