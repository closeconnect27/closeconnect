-- Owner-set cap on community size, chosen at creation (also editable
-- later, matching every other community setting) -- null means unlimited,
-- the default, so every existing community keeps behaving exactly as
-- before. Once member_count reaches the limit, no new join can succeed
-- through ANY path (open join, a request being approved, or a claim being
-- approved) -- enforced once, at the table level, rather than duplicated
-- in each of those three call sites.
alter table communities add column member_limit int;
alter table communities add constraint communities_member_limit_positive check (member_limit is null or member_limit > 0);

-- Same shape as enforce_ticket_capacity (0030): a transaction-scoped
-- advisory lock keyed to the community so two people joining the last open
-- spot at once can't both pass the same "9 of 10" snapshot before either
-- commits. Runs BEFORE insert, unlike sync_community_member_count (0001,
-- AFTER insert) -- member_count at this point still reflects the count
-- *before* this row, which is exactly what needs checking against the limit.
create function public.enforce_community_member_limit()
returns trigger language plpgsql as $$
declare
  v_limit integer;
  v_count integer;
begin
  select member_limit into v_limit from communities where id = new.community_id;
  if v_limit is null then
    return new; -- unlimited
  end if;

  perform pg_advisory_xact_lock(hashtext(new.community_id::text));

  select count(*) into v_count from community_members where community_id = new.community_id;

  if v_count >= v_limit then
    raise exception 'This community is full.';
  end if;

  return new;
end;
$$;

create trigger community_members_enforce_limit
  before insert on community_members
  for each row
  execute function public.enforce_community_member_limit();
