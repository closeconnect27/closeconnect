-- The separate photo-gallery feature (community_images/event_images) is
-- fully replaced by inline images embedded in description_content (0049)
-- -- no app code reads or writes either table anymore. Storage objects
-- under the old gallery/ path prefix are left in the community-images/
-- event-images buckets (harmless orphaned files, not referenced by any
-- row), matching how logo/cover cleanup was handled in 0047.
drop table community_images;
drop table event_images;
