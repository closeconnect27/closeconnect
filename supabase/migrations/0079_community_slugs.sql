-- Pretty, stable URLs for communities (e.g. /communities/the-playhouse
-- instead of /communities/91e93ba1-...) -- assigned once at creation and
-- never regenerated on a later name edit, so an already-shared/bookmarked
-- link never rots just because a host renamed their community. The old
-- /communities/{uuid} form keeps working indefinitely too (getCommunityById
-- accepts either) -- every notification/email link already sent, and
-- every row created before this migration, still resolves correctly.
alter table communities add column slug text unique;

create or replace function public.slugify(input text) returns text
language sql immutable as $$
  select nullif(trim(both '-' from regexp_replace(lower(regexp_replace(input, '[^a-zA-Z0-9\s-]', '', 'g')), '\s+', '-', 'g')), '')
$$;

-- Backfill existing rows, oldest first -- whichever community had a given
-- name earliest gets the plain slug, later namesakes get a numeric suffix.
do $$
declare
  r record;
  base_slug text;
  candidate text;
  suffix int;
begin
  for r in select id, name from communities order by created_at loop
    base_slug := coalesce(public.slugify(r.name), 'community');
    candidate := base_slug;
    suffix := 1;
    while exists (select 1 from communities where slug = candidate) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;
    update communities set slug = candidate where id = r.id;
  end loop;
end $$;

alter table communities alter column slug set not null;

-- New communities (native creation, external submission, or anything else
-- that inserts a row without an explicit slug) get one generated the same
-- way, with the same collision handling. security definer so the
-- uniqueness check sees every row regardless of the inserting role's own
-- RLS visibility, matching every other cross-cutting trigger in this schema.
create function public.generate_community_slug()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_slug text;
  candidate text;
  suffix int := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  base_slug := coalesce(public.slugify(new.name), 'community');
  candidate := base_slug;
  while exists (select 1 from communities where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger communities_generate_slug
  before insert on communities
  for each row execute function public.generate_community_slug();
