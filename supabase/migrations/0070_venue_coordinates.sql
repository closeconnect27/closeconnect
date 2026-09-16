-- Google Places Autocomplete on the venue field (host request: real address
-- picking + an embedded map on the event page, not just a free-text string).
-- venue itself stays a plain text column -- still the display label/address
-- shown everywhere venue already renders -- these are purely additive so a
-- map can be drawn from a real place, without touching any existing query
-- that only ever reads `venue`.
alter table events
  add column venue_lat double precision,
  add column venue_lng double precision,
  add column venue_place_id text;

comment on column events.venue_lat is 'Latitude from Google Places Autocomplete, when the host picked a suggestion (null for hand-typed venues, or events created before this column existed).';
comment on column events.venue_lng is 'Longitude, paired with venue_lat.';
comment on column events.venue_place_id is 'Google Places place_id, kept for reference/future re-lookup -- not used as a foreign key anywhere.';
