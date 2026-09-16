-- 0123 always inserted profile_dm_threads as 'pending', regardless of
-- whether the recipient already follows the requester -- the "skip the
-- request queue for someone you already follow" half of the Instagram-
-- style design was never actually wired up. Fixed with a BEFORE INSERT
-- trigger that authoritatively decides the row's real status server-side
-- (the client's own insert no longer needs to, and can't, guess right).
create function public.set_profile_dm_thread_initial_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profile_follows where follower_id = new.recipient_id and followee_id = new.requester_id) then
    new.status := 'accepted';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;
create trigger profile_dm_thread_initial_status
  before insert on profile_dm_threads
  for each row execute function public.set_profile_dm_thread_initial_status();

-- The insert policy's own status check is now redundant with (and would
-- conflict with) the trigger deciding the real value -- WITH CHECK
-- evaluates the row as it stands after BEFORE triggers run, so demanding
-- 'pending' here would reject the exact rows the trigger just marked
-- 'accepted'.
drop policy "profile_dm_threads_insert_own" on profile_dm_threads;
create policy "profile_dm_threads_insert_own" on profile_dm_threads for insert to authenticated
  with check (
    requester_id = auth.uid()
    and not is_blocked_pair(requester_id, recipient_id)
  );
