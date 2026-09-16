-- Security audit fixes (see conversation for the full audit). Each item
-- below is independent; grouped into one migration only for deploy
-- convenience.

-- ---------------------------------------------------------------------
-- 1. CRITICAL: auto_verify_organizer(p_user_id uuid) is a plain callable
-- security-definer function with no check that the caller has any
-- relationship to p_user_id -- it was only ever meant to be invoked by
-- the two triggers below it in 0060_auto_verify_organizers.sql (which
-- pass new.owner_id/new.host_id), but Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and no migration ever revoked it. As
-- shipped, any authenticated caller could call
-- supabase.rpc('auto_verify_organizer', { p_user_id: '<any-uuid>' })
-- directly and grant themselves (or anyone) the verified-organizer
-- badge with zero real verification. Revoking EXECUTE doesn't affect the
-- triggers themselves -- trigger invocation bypasses privilege checks
-- entirely in Postgres, only direct RPC/SQL calls go through GRANT/REVOKE.
revoke execute on function public.auto_verify_organizer(uuid) from public, anon, authenticated;

-- Same shape, lower severity (can only force a real recompute from actual
-- feedback rows, can't write a false rating) -- revoked for consistency,
-- not because it was independently exploitable for data corruption.
revoke execute on function public.sync_host_rating(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. MEDIUM: get_group_unread_count(p_group_id uuid) is security definer
-- and never checked is_group_member() before returning a count -- an
-- outsider who can guess/enumerate a group_id (these aren't hidden --
-- they appear in a community's public group list) got back the total
-- message count of a private sub-group they were never a member of.
-- Message content/participants were never exposed (community_messages'
-- own RLS still protects those), but the volume metadata leaked. Fixed
-- by returning 0 for anyone who isn't actually a member, matching the
-- safer pattern get_event_interest_count (0040) already uses.
create or replace function public.get_group_unread_count(p_group_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case when is_group_member(p_group_id) then (
    select count(*) from community_messages
    where group_id = p_group_id
      and user_id != auth.uid()
      and created_at > coalesce(
        (select last_read_at from community_group_reads where group_id = p_group_id and user_id = auth.uid()),
        'epoch'::timestamptz
      )
  ) else 0 end;
$$;

-- ---------------------------------------------------------------------
-- 3. Defense-in-depth: dm_reads' insert/update policies (0074) only
-- checked user_id = auth.uid(), not that the caller is actually a
-- participant on the thread being marked read. Since dm_reads holds
-- nothing but the caller's own bookkeeping timestamp (dm_reads_select_own
-- already restricts reads to the caller), this couldn't expose anyone
-- else's data -- but community_group_reads' equivalent policy (0046)
-- already does the stricter check, and this should match it.
drop policy "dm_reads_upsert_own" on dm_reads;
drop policy "dm_reads_update_own" on dm_reads;

create policy "dm_reads_upsert_own" on dm_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (thread_kind = 'community' and exists (
        select 1 from community_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
      ))
      or
      (thread_kind = 'event' and exists (
        select 1 from event_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
      ))
    )
  );
create policy "dm_reads_update_own" on dm_reads for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (thread_kind = 'community' and exists (
        select 1 from community_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
      ))
      or
      (thread_kind = 'event' and exists (
        select 1 from event_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
      ))
    )
  );

-- ---------------------------------------------------------------------
-- 4. Functional regression (not a security hole, but introduced in the
-- same 0074 batch): community_dm_messages needed a follow-up fix (0068)
-- to join the realtime publication so DmModal's live subscription
-- actually fires; event_dm_messages (0074) was never added, so
-- EventDmModal's equivalent subscription silently never fires.
alter publication supabase_realtime add table event_dm_messages;

-- ---------------------------------------------------------------------
-- 5. toggleContactVerification (src/app/actions/verification.ts) ran a
-- plain update through the caller's own RLS-scoped client -- profiles'
-- RLS (profiles_update_own) only allows `id = auth.uid()`, with no admin
-- override, so an admin calling this on someone ELSE's profile silently
-- matched zero rows and returned a false "success". Not reachable from
-- any current UI (per that function's own comment), so not an active
-- vulnerability, but it was broken and, per the pattern below, would have
-- been a real gap if it needs to be called with a raw column name --
-- deliberately not using dynamic SQL (format('...%I...', p_field)) to set
-- this, which would let a direct RPC call with an unexpected p_field
-- string target an arbitrary column; hard-branching on the two known
-- valid fields avoids that entirely.
create function public.admin_toggle_contact_verification(p_profile_id uuid, p_field text, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Only an admin can do this';
  end if;
  if p_field = 'verified_phone' then
    update profiles set verified_phone = p_value where id = p_profile_id;
  elsif p_field = 'verified_email' then
    update profiles set verified_email = p_value where id = p_profile_id;
  else
    raise exception 'Invalid field: %', p_field;
  end if;
end;
$$;
