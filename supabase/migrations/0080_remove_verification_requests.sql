-- Removes the community "request verification" flow entirely, per explicit
-- product decision -- no replacement (admins currently have no direct way
-- to flag a community verified either; that's a deliberate gap, not an
-- oversight, until/unless asked for separately). Organizer verification
-- was already automatic (0060), so this table's insert path (always
-- target_type='community') was the only thing left using it at all.
--
-- communities.is_verified/verified_at/verified_by are untouched -- already-
-- verified communities keep their badge; this only removes the mechanism
-- that used to grant new ones.
drop trigger if exists verification_request_reviewed on verification_requests;
drop function if exists public.review_verification_request();
drop table if exists verification_requests;
