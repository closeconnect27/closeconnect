-- Prevents the same email registering twice for the same event, without
-- adding any account-creation friction to attending -- guest registration
-- stays exactly as open as before (SPEC.md Section 1), this only blocks a
-- second submission using an email already used for that event. Case-
-- insensitive (lower()) so "A@x.com" and "a@x.com" don't slip past as
-- distinct registrants.
create unique index form_responses_one_registration_per_event_email
  on form_responses(owner_id, (lower(response_data->>'email')))
  where owner_type = 'event';
