-- Rich description content (Tiptap ProseMirror JSON) alongside the
-- existing plain-text `description` column, not replacing it --
-- `description` stays the auto-derived plain-text extract (used for
-- search/previews/emails, anywhere plain text is simpler than rendering
-- the rich doc), kept in sync on every save. `description_content` is
-- null for every row created before this -- the display layer falls back
-- to rendering the plain `description` as a single paragraph when null,
-- so nothing needs backfilling for this to work correctly.
alter table communities add column description_content jsonb;
alter table events add column description_content jsonb;
