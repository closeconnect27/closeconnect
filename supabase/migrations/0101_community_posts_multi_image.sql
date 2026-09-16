-- Multiple images per feed post (was a single optional image_path,
-- 0099_community_posts_feed.sql). Adds a new array column rather than
-- widening image_path in place -- existing rows keep their single image_path
-- untouched (display code falls back to it when image_paths is empty), new
-- posts write into image_paths instead. Storage bucket/RLS
-- (community-post-images) already scopes purely by path prefix
-- ({community_id}/...), independent of which column holds the paths, so no
-- storage policy changes are needed.
alter table community_posts add column image_paths text[] not null default '{}';

-- Backfill: fold any existing single image_path into the new array so old
-- posts don't lose their photo once the app switches to reading image_paths.
update community_posts set image_paths = array[image_path] where image_path is not null;
