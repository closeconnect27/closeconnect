-- Cumulative seconds a registrant has actually spent in this event's
-- LiveKit call, across every join/leave cycle (a dropped connection and
-- rejoin should add up, not reset -- someone who joins for 3 minutes,
-- disconnects, and rejoins for 3 more genuinely attended 6 minutes). The
-- LiveKit webhook route increments this on each participant_left event and
-- auto-marks checked_in_at/checked_in_count once the running total crosses
-- the configured minimum-duration threshold.
alter table form_responses add column livekit_attended_seconds int not null default 0;
