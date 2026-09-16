-- Flip both member-visibility toggles (members_list_visible 0052,
-- member_count_visible 0054) from opt-out to opt-in for every community
-- created from here on -- a brand new community has zero members either
-- way, and showing that starts it off looking empty rather than new.
-- Existing communities are untouched by this (0083 already backfilled the
-- 104 formerly-external ones specifically; the pre-existing native ones
-- keep whatever visibility they already have). Owners can still turn
-- either back on per-community via MembersVisibilityToggle/
-- MemberCountVisibilityToggle -- this only changes the starting point.
alter table communities alter column members_list_visible set default false;
alter table communities alter column member_count_visible set default false;
