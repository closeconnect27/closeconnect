-- Removing the one-registration-per-account restriction (0015): a
-- legitimate use case (booking again, e.g. for a plus-one or a second
-- slot) was being hard-blocked at the DB level with no way around it. The
-- app now handles this with a client-side confirmation prompt ("you've
-- already registered, register again?") instead of a database constraint
-- -- rate-limiting (0016's form_responses_event_rate_limit_idx/trigger)
-- is untouched, so rapid repeat submissions are still throttled.
drop index if exists form_responses_one_registration_per_event_respondent;
