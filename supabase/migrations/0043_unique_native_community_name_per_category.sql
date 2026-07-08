-- A native community's name only needs to be distinct from other native
-- communities in the same category -- "Runners Club" under Sports and
-- "Runners Club" under Social aren't the same listing colliding, so the
-- uniqueness is scoped to (category, name) rather than name alone.
-- Case-insensitive (lower(name)) so "Runners Club" and "runners club"
-- can't coexist either. Scoped to kind = 'native': external (link-out)
-- listings aren't this app's own community and can legitimately share a
-- name with a native one, or with each other.
create unique index communities_unique_name_per_category_native
  on communities (category, lower(name))
  where kind = 'native';
