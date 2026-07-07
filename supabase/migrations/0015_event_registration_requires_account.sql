-- Event registration now requires a signed-in account -- the earlier
-- guest-friendly decision (0001_init.sql's form_responses_insert_event_guest)
-- is deliberately reversed: registration needs a real identity for
-- legitimacy/security, matching how community join already worked. No RLS
-- changes needed beyond this: every existing policy already keys off
-- auth.uid(), which stays identical regardless of auth provider.
drop policy "form_responses_insert_event_guest" on form_responses;
create policy "form_responses_insert_event" on form_responses for insert to authenticated
  with check (
    owner_type = 'event'
    and status = 'approved'
    and respondent_id = auth.uid()
  );

-- Duplicate-registration prevention (0012) keyed off the free-text email
-- field because a guest had no other identity signal. Now that every
-- registrant has a real account, respondent_id is the actual identity that
-- matters -- a free-text email field is trivially spoofable (varying case,
-- using a different real address, etc.), whereas respondent_id is the
-- verified account that made the request.
drop index if exists form_responses_one_registration_per_event_email;
create unique index form_responses_one_registration_per_event_respondent
  on form_responses(owner_id, respondent_id)
  where owner_type = 'event';
