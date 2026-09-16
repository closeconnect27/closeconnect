-- Supersedes 0108 with a narrower, corrected shape: the distinct 'owner'
-- role/label stays (features like "message the host" need exactly one
-- person to point at), but every OTHER capability an owner has is now
-- also available to any admin (moderator): promoting/demoting other
-- members, editing community details, and the members_list_visible/
-- member_count_visible toggles. The owner's own row still can't be
-- touched by a mere admin (can't be demoted or removed), preserving that
-- single point of contact. Also adds a real ownership-transfer path so an
-- owner can hand off before leaving, instead of being hard-blocked from
-- ever leaving at all.

-- 1. Role column accepts 'owner' again -- must happen before the data
-- restore below, or the UPDATE itself violates 0108's narrower check
-- constraint.
alter table community_members drop constraint if exists community_members_role_check;
alter table community_members add constraint community_members_role_check check (role in ('owner','moderator','member'));

-- 2. Restore role='owner' for whoever communities.owner_id still says it
-- is -- that column was never touched by 0108, so this is a lossless,
-- exact reconstruction of the pre-0108 data (0108 had collapsed every
-- 'owner' row to 'moderator').
update community_members cm
set role = 'owner'
from communities c
where c.id = cm.community_id
  and c.owner_id = cm.user_id
  and cm.role = 'moderator';

-- 3. Restore the original 0108-replaced functions verbatim -- 'owner' is a
-- real role value again, not an alias for 'moderator'.
create or replace function public.is_community_staff(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = p_community_id and user_id = auth.uid() and role in ('owner','moderator')
  );
$$;

create or replace function public.on_community_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_general_id uuid;
begin
  insert into community_groups (community_id, name, is_default)
  values (new.id, 'Common Room', true)
  returning id into v_general_id;

  insert into community_groups (community_id, name, is_announcement, is_default)
  values (new.id, 'Broadcast', true, false);

  if new.owner_id is not null then
    insert into community_members (community_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.owner_id from community_groups cg
    where cg.community_id = new.id and cg.is_default
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.review_community_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  new.reviewed_at = now();

  if new.status = 'approved' then
    update communities set owner_id = new.claimant_user_id, claim_status = 'approved' where id = new.community_id;

    insert into community_members (community_id, user_id, role)
    values (new.community_id, new.claimant_user_id, 'owner')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.claimant_user_id from community_groups cg
    where cg.community_id = new.community_id and cg.is_default
    on conflict (group_id, user_id) do nothing;

    insert into notifications (user_id, type, title, body, link)
    select new.claimant_user_id, 'claim_approved', 'Claim approved', c.name || ' is now yours to manage.', '/communities/' || new.community_id
    from communities c where c.id = new.community_id;
  elsif new.status = 'rejected' then
    update communities set claim_status = 'rejected' where id = new.community_id;
  end if;

  return new;
end;
$$;

-- 4. Role changes (promote/demote): any staff member can now do this to
-- any OTHER member -- not owner-only anymore. The owner's own row stays
-- protected (a plain admin still can't touch it), same protection as the
-- delete policy already has below.
drop policy "community_members_update_staff" on community_members;
create policy "community_members_update_staff" on community_members for update to authenticated
  using (is_community_staff(community_id))
  with check (
    is_admin()
    or exists (
      select 1 from community_members cm
      where cm.community_id = community_members.community_id and cm.user_id = auth.uid() and cm.role = 'owner'
    )
    or (
      is_community_staff(community_id)
      and role <> 'owner'
      and not exists (
        select 1 from community_members cm
        where cm.community_id = community_members.community_id
          and cm.user_id = community_members.user_id
          and cm.role = 'owner'
      )
    )
  );

-- 5. Remove/leave -- unchanged from before 0108: staff can already remove
-- any non-owner member (this was already equal), the owner's own row can't
-- be removed by anyone but themselves, and the owner can't self-remove at
-- all (they must transfer ownership first -- see leaveCommunity's app-layer
-- flow and the transfer function below).
drop policy "community_members_delete_self_or_staff" on community_members;
create policy "community_members_delete_self_or_staff" on community_members for delete to authenticated
  using (
    (user_id = auth.uid() and role <> 'owner')
    or is_admin()
    or (
      is_community_staff(community_id)
      and role <> 'owner'
    )
  );

-- 6. Community details + the members_list_visible/member_count_visible
-- toggles: any staff member can edit now, not just the owner -- the only
-- columns that stay pinned regardless of who's writing are owner_id,
-- claim_status, join_mode, and is_founding (unrelated to the admin/owner
-- capability question -- those are globally immutable via this update
-- path for everyone, owner included, same as before 0108).
drop policy "communities_update_owner_or_admin" on communities;
create policy "communities_update_owner_or_admin" on communities for update to authenticated
  using (owner_id = auth.uid() or is_community_staff(id) or is_admin())
  with check (
    is_admin()
    or (
      (owner_id = auth.uid() or is_community_staff(id))
      and owner_id = (select c.owner_id from communities c where c.id = communities.id)
      and claim_status = (select c.claim_status from communities c where c.id = communities.id)
      and join_mode = (select c.join_mode from communities c where c.id = communities.id)
      and is_founding = (select c.is_founding from communities c where c.id = communities.id)
    )
  );

-- 7. Self-rating prevention now covers any staff member, not just whoever
-- created it -- same "not a meaningful signal, one-sided lever" reasoning
-- as 0013, just applied at the right grain now that admins can do
-- everything else an owner can.
drop policy "community_ratings_insert_own" on community_ratings;
create policy "community_ratings_insert_own" on community_ratings for insert to authenticated
  with check (
    user_id = auth.uid()
    and not is_community_staff(community_id)
  );

drop policy "community_ratings_update_own" on community_ratings;
create policy "community_ratings_update_own" on community_ratings for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not is_community_staff(community_id)
  );

-- 8. Ownership transfer: only the current owner may call this (checked
-- against communities.owner_id fresh, not trusted from the caller), the
-- new owner must already be a member, and it can't target the caller's own
-- row. Runs security definer specifically because
-- communities_update_owner_or_admin pins owner_id unchanged for every
-- ordinary update (by design) -- there is no other path that can move it.
-- Demotes the outgoing owner to 'moderator' rather than deleting their row
-- outright -- leaveCommunity's own existing delete step (self, role <>
-- 'owner') picks up from there once this returns, so a transfer that isn't
-- immediately followed by leaving just leaves the old owner as a regular
-- admin, which is also a correct standalone outcome.
create or replace function public.transfer_community_ownership(p_community_id uuid, p_new_owner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_current_owner uuid;
begin
  select owner_id into v_current_owner from communities where id = p_community_id;
  if v_current_owner is null or v_current_owner <> auth.uid() then
    raise exception 'Only the current owner can transfer ownership.';
  end if;
  if p_new_owner_id = auth.uid() then
    raise exception 'Choose someone else to transfer ownership to.';
  end if;
  if not exists (select 1 from community_members where community_id = p_community_id and user_id = p_new_owner_id) then
    raise exception 'That person is not a member of this community.';
  end if;

  update communities set owner_id = p_new_owner_id where id = p_community_id;
  update community_members set role = 'owner' where community_id = p_community_id and user_id = p_new_owner_id;
  update community_members set role = 'moderator' where community_id = p_community_id and user_id = auth.uid();
end;
$$;

grant execute on function public.transfer_community_ownership(uuid, uuid) to authenticated;
