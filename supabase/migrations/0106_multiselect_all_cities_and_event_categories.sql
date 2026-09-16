-- City/category selection becomes a single multiselect per field (no more
-- separate required-primary + capped "extra" UI) -- city gets no cap and a
-- new "All cities" escape hatch (for a host who isn't tied to specific
-- cities, e.g. a fully-online event/community); category keeps its
-- existing total cap of 5 (1 primary + up to 4 extra, unchanged), newly
-- extended to events too (previously community-only).
alter table communities add column all_cities boolean not null default false;
alter table events add column all_cities boolean not null default false;
alter table events add column extra_categories text[] not null default '{}';

-- Single vs multi-day event type needs no new column -- it's still decided
-- purely by whether event_end_date differs from event_date (0072); the
-- create/edit forms just gate which UI (one date vs. a range) is offered.
