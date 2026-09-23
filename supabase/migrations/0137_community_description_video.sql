-- Community descriptions can now embed one short video (same "reel, not a
-- gallery" posture as 0131's community_posts.video_path) alongside up to 5
-- images. Widen the existing community-images bucket rather than adding a
-- new one -- same bucket, same owner-only insert policy (0018/0026), just
-- also admitting a handful of video mime types. 50MB / mime list matches
-- 0131's community-post-images precedent exactly, for the same reason (a
-- genuinely "short" clip, app layer nudges toward that, this is the
-- backstop).
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
where id = 'community-images';
