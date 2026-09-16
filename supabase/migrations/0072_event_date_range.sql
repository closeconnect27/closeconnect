-- Optional end date for a multi-day event, alongside the existing
-- event_date (start). Null means single-day (the common case, and every
-- event created before this column existed) -- display/queries only need
-- to special-case a range when event_end_date is actually set and differs
-- from event_date.
alter table events
  add column event_end_date date;

comment on column events.event_end_date is 'Optional end date for a multi-day event. Null (or equal to event_date) means single-day.';
