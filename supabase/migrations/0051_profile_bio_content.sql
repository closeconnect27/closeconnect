-- Rich-text bio, mirroring description_content on communities/events
-- (0049) -- Tiptap ProseMirror JSON, no images (bio has no imageUpload
-- wired in RichTextEditor, and the schema-level bioContentField rejects
-- any image node that reached the server another way).
alter table profiles add column bio_content jsonb;
