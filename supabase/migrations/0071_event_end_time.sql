-- Adds an optional end time alongside the existing event_time (start).
-- Duration (e.g. "1 hour", "2 hours") is a form-only convenience that
-- computes this column from start + duration -- not stored separately,
-- since storing both would let them drift out of sync with each other.
alter table events
  add column event_end_time text;

comment on column events.event_end_time is 'Optional "HH:MM" end time, same format/timezone convention as event_time. Null means no end time was set (open-ended).';
