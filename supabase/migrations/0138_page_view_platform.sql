-- Which platform views/joins come from (web vs the native app) -- until now
-- every page_views row was implicitly "web" since the mobile app never
-- wrote to this table at all (it only ever READ page_views for its own
-- analytics screens). Defaults to 'web' for exactly that reason: every
-- existing row, and any web insert that doesn't explicitly set this yet,
-- really was a web view.
alter table page_views add column platform text not null default 'web'
  check (platform in ('web', 'app'));
