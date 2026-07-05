-- Found while manually cleaning up leftover RLS-test accounts (Phase 10):
-- reports.reporter_id had no ON DELETE action, so deleting any user who had
-- ever filed a report was blocked outright by a foreign key violation.
-- SET NULL over CASCADE, same reasoning as 0009's ticket_type_id fix: the
-- report itself is real moderation history and should survive the reporter
-- deleting their account or being removed -- only the identity of who filed
-- it needs to go, not the report.
alter table reports drop constraint reports_reporter_id_fkey;
alter table reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references profiles(id) on delete set null;
