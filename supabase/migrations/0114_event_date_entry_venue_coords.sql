-- Multi-day events now pick each date entry's venue via the same Google
-- Places Autocomplete map widget the single-day "Venue" field already uses
-- (VenueAutocomplete), not a plain text box -- these mirror events'
-- own venue_lat/venue_lng/venue_place_id (0070) exactly, just per-entry
-- instead of once for the whole event.
alter table event_date_entries
  add column venue_lat double precision,
  add column venue_lng double precision,
  add column venue_place_id text;

comment on column event_date_entries.venue_lat is 'Latitude from Google Places Autocomplete, when the host picked a suggestion (null for hand-typed venues).';
comment on column event_date_entries.venue_lng is 'Longitude, paired with venue_lat.';
comment on column event_date_entries.venue_place_id is 'Google Places place_id, kept for reference/future re-lookup -- not used as a foreign key anywhere.';
