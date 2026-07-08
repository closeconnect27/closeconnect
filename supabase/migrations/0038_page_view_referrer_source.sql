-- Community Analytics (Branch 3). Captured client-side from
-- document.referrer at view time (PageViewTracker), classified into a
-- small fixed set of buckets via simple domain-string matching -- no
-- geo/IP lookups, no new dependency, matching this table's existing
-- privacy posture (0021_page_views.sql: no IP storage or fingerprinting).
alter table page_views add column referrer_source text
  check (referrer_source in ('direct', 'search', 'social', 'instagram', 'linkedin', 'other'));
