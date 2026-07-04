-- Fix: the unqualified `owner_id` in the EXISTS subqueries below resolved to
-- communities.owner_id (column name collision with the correlated table),
-- not form_responses.owner_id -- so the check was always false. Caught by
-- the real RLS test suite (supabase/tests/rls.mjs): B could not self-join
-- an open community at all.
drop policy "form_responses_insert_community" on form_responses;

create policy "form_responses_insert_community" on form_responses for insert to authenticated
  with check (
    owner_type = 'community'
    and respondent_id = auth.uid()
    and (
      (status = 'pending' and exists (select 1 from communities c where c.id = form_responses.owner_id and c.join_mode = 'request'))
      or (status = 'approved' and exists (select 1 from communities c where c.id = form_responses.owner_id and c.join_mode = 'open'))
    )
  );
