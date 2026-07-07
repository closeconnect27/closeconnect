-- Regression sweep finding: communities_insert_external_public allows any
-- unauthenticated caller to insert an external community, and until now
-- external_link format was validated only by the app's zod schema
-- (isValidExternalLink). Anyone hitting the anon-key REST endpoint directly
-- (the anon key is public in the browser bundle) could bypass the app
-- entirely and list a link to any domain. This mirrors that same
-- WhatsApp/Instagram-only rule as a DB-level floor, matching the
-- defense-in-depth pattern the file's own comment describes for
-- safeJoinHref vs isValidExternalLink.
create or replace function public.is_valid_external_link(url text)
returns boolean
language sql
immutable
as $$
  select
    url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,}(\?[^#]*)?(#.*)?$'
    or url ~ '^https://(www\.)?whatsapp\.com/channel/.{2,}$'
    or url ~ '^https://(www\.)?instagram\.com/.+$'
$$;

alter table communities add constraint communities_external_link_check
  check (kind = 'native' or external_link is null or public.is_valid_external_link(external_link));
