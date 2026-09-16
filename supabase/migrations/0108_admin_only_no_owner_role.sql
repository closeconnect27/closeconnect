-- Collapses community_members.role's 'owner' value into 'moderator'
-- ("Admin" in the UI) -- product decision: a community has admins with
-- identical capabilities, not one distinguished owner with extra powers.
-- communities.owner_id stays as an internal bookkeeping column (who
-- created it / was approved via a claim -- the claims flow still needs to
-- record this), but it no longer grants any capability role='moderator'
-- doesn't already grant, and it's never surfaced to users as "Owner".

-- 1. Existing data: every current 'owner' row becomes 'moderator'.
update community_members set role = 'moderator' where role = 'owner';

-- 2. The role column no longer accepts 'owner' going forward.
alter table community_members drop constraint if exists community_members_role_check;
alter table community_members add constraint community_members_role_check check (role in ('moderator','member'));

-- 3. 'owner' can never appear in role anymore, but keep this explicit
-- rather than relying on that invariant silently.
create or replace function public.is_community_staff(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = p_community_id and user_id = auth.uid() and role = 'moderator'
  );
$$;

-- 4. New communities: the creator is added as 'moderator', not 'owner'.
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
    values (new.id, new.owner_id, 'moderator')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.owner_id from community_groups cg
    where cg.community_id = new.id and cg.is_default
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

-- 5. Claim approval: the new claimant becomes 'moderator', same as anyone
-- else who's ever added to staff.
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
    values (new.community_id, new.claimant_user_id, 'moderator')
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

-- 6a. Role changes (promote/demote): any staff member can now do this to
-- anyone, including another staff member -- no more owner-only gate.
-- Self-demotion is still guarded (6b's same "don't strand the community"
-- rule) so this can't be used as a side door around the leave restriction.
drop policy "community_members_update_staff" on community_members;
create policy "community_members_update_staff" on community_members for update to authenticated
  using (is_community_staff(community_id))
  with check (
    is_admin()
    or (
      is_community_staff(community_id)
      and (
        user_id <> auth.uid()
        or role = 'moderator'
        or exists (
          select 1 from community_members other
          where other.community_id = community_members.community_id
            and other.user_id <> auth.uid()
            and other.role = 'moderator'
        )
        or not exists (
          select 1 from community_members other
          where other.community_id = community_members.community_id
            and other.user_id <> auth.uid()
        )
      )
    )
  );

-- 6b. Remove/leave: staff removing someone ELSE is unconditionally allowed
-- now (no owner row left to protect). Self-removal (leaving) is blocked
-- only when the caller is the community's last remaining staff member AND
-- at least one other member would be stranded without any admin -- an
-- ordinary member can always leave, and a solo staff member with no other
-- members at all can also leave (the community just reverts to unclaimed,
-- see the trigger below).
drop policy "community_members_delete_self_or_staff" on community_members;
create policy "community_members_delete_self_or_staff" on community_members for delete to authenticated
  using (
    is_admin()
    or (user_id <> auth.uid() and is_community_staff(community_id))
    or (
      user_id = auth.uid()
      and (
        role <> 'moderator'
        or exists (
          select 1 from community_members other
          where other.community_id = community_members.community_id
            and other.user_id <> auth.uid()
            and other.role = 'moderator'
        )
        or not exists (
          select 1 from community_members other
          where other.community_id = community_members.community_id
            and other.user_id <> auth.uid()
        )
      )
    )
  );

-- 7. The members_list_visible/member_count_visible carve-out (0105) was
-- pinned to the exact owner_id row -- loosen it to any staff member, same
-- as every other admin-level capability.
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
      and (is_community_staff(id) or members_list_visible = (select c.members_list_visible from communities c where c.id = communities.id))
      and (is_community_staff(id) or member_count_visible = (select c.member_count_visible from communities c where c.id = communities.id))
    )
  );

-- 8. When a community's very last member leaves (the solo-admin exit
-- case allowed by 6b), it reverts to unclaimed rather than being stranded
-- with a stale owner_id pointing at someone no longer even a member --
-- matching the existing external/unclaimed community model exactly, so
-- a future owner can claim it the normal way.
create or replace function public.reset_community_if_abandoned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from community_members where community_id = old.community_id) then
    update communities set owner_id = null, claim_status = 'unclaimed' where id = old.community_id;
  end if;
  return old;
end;
$$;

drop trigger if exists community_members_reset_if_abandoned on community_members;
create trigger community_members_reset_if_abandoned
  after delete on community_members
  for each row
  execute function public.reset_community_if_abandoned();

-- 9. Self-rating prevention (0013) only ever checked owner_id -- a
-- moderator could already rate their own community's average either
-- direction, which is exactly the one-sided-lever problem 0013 was meant
-- to close. Now covers any admin, not just whoever created it.
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
