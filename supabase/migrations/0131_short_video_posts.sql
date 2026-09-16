-- Short video posts: community_posts gets a video_path column (mirrors
-- image_path/image_paths' shape -- a storage path, not a URL, resolved to
-- a public URL by callers exactly like the image columns already are).
-- Only ONE video per post (not an array like image_paths) -- a "reel," not
-- a gallery. A post with a video never also has content_content/image
-- fields populated -- app layer treats "Post"/"Poll"/"Video" as three
-- mutually exclusive post shapes, same posture as poll vs plain post.
alter table community_posts add column video_path text;

-- Widen the existing post-images bucket rather than adding a new one --
-- same bucket, same staff-only insert policy (0099), just also admitting a
-- handful of video mime types. 50MB covers a genuinely "short" clip; the
-- app layer nudges toward something shorter, this is just the backstop.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
where id = 'community-post-images';
