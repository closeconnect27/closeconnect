-- A real, unique-per-entity Unsplash photo, assigned once at creation
-- (or by backfill for existing rows) and persisted -- not recomputed on
-- every render. unsplash_image_url is the ready-to-use base CDN URL
-- (size params appended at render time); unsplash_photo_id is Unsplash's
-- short photo id, kept so a future re-assignment or download-ping retry
-- can reference the exact photo without re-deriving it from the URL.
alter table communities add column unsplash_image_url text;
alter table communities add column unsplash_photo_id text;
alter table events add column unsplash_image_url text;
alter table events add column unsplash_photo_id text;
