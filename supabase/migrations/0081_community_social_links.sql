-- Optional contact/social fields a host can add when creating or editing a
-- native community -- all nullable, no backfill needed. Directly on
-- communities (not a separate table like profile_details) since community
-- info has no privacy/visibility concept at all -- it's already fully
-- public, same as city/external_link.
alter table communities add column instagram_url text;
alter table communities add column facebook_url text;
alter table communities add column linkedin_url text;
alter table communities add column phone text;
