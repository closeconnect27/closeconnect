-- Rich content for feed posts, same convention as description_content on
-- communities/events (0049_rich_description_content.sql): `content` stays
-- the plain-text extract (used for previews/search), `content_content` is
-- the Tiptap-shaped doc (nullable -- existing posts and any future
-- plain-text-only post render fine without it). Images now embed directly
-- in the doc (an `image` node), superseding the separate image_paths array
-- for new posts -- image_paths stays populated for pre-existing rows so
-- their photos keep rendering.
alter table community_posts add column content_content jsonb;
