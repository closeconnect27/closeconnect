-- Product reversal: personalized logo/cover uploads are removed entirely
-- (communities and events both always show a category Unsplash placeholder
-- now instead). The gallery feature (community_images/event_images) is
-- unrelated and untouched -- these are the single-slot columns only.
-- Storage cleanup (deleting the actual uploaded files under {id}/logo/ and
-- {id}/cover/) happens separately via the Storage API, not SQL.
alter table communities drop column logo_url;
alter table communities drop column cover_image_url;
alter table events drop column cover_image_url;
