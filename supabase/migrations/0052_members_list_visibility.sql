-- Owner-controlled toggle for the whole members list (WhatsApp-style):
-- when off, ordinary members can't see the full roster -- the owner and
-- moderators ("admins") still always show regardless, enforced in the
-- MemberList component, not RLS (community_members_select_public, 0001,
-- stays fully public -- staff still need to look up any member by id for
-- remove/promote, and this is a display preference, not a privacy gate on
-- otherwise-sensitive data).
alter table communities add column members_list_visible boolean not null default true;
