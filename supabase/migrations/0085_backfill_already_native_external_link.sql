-- 0083 only touched rows that were still kind = 'external' at push time.
-- 5 communities had already gone through the old (pre-0083) "Go Native"
-- button and were kind = 'native' with owner_id set before 0083 ran, so its
-- `where kind = 'external'` updates never reached them -- their WhatsApp
-- link is still sitting in external_link, which nothing renders anymore
-- (CommunityDetailActions/CommunityCard no longer read it at all, per
-- 0083). Same split, just keyed on external_link's presence directly
-- instead of kind, since kind can no longer distinguish "not yet migrated"
-- from "always was native."
update communities
set whatsapp_url = external_link
where external_link is not null and external_link ~ 'whatsapp\.com' and whatsapp_url is null;

update communities
set instagram_url = external_link
where external_link is not null and external_link ~ 'instagram\.com' and instagram_url is null;

update communities set external_link = null where external_link is not null;
