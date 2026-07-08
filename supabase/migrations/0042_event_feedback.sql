-- Event RSVP & Attendance funnel, part 3: event feedback. Mirrors
-- community_ratings (same shape, same avg/count sync trigger, same public
-- select + owner-gated write policies) but the write gate is "actually
-- attended" rather than "is a member" -- anyone can register for an event,
-- so registration alone isn't a meaningful feedback signal the way
-- community membership is.
create function public.is_checked_in_attendee(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from form_responses
    where owner_type = 'event' and owner_id = p_event_id
      and respondent_id = auth.uid() and checked_in_at is not null
  );
$$;

alter table events add column avg_feedback_rating numeric(2,1) default 0;
alter table events add column feedback_count int default 0;

create table event_feedback (
  event_id uuid references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);
alter table event_feedback enable row level security;

create function public.sync_event_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update events set
    avg_feedback_rating = coalesce((select round(avg(rating)::numeric, 1) from event_feedback where event_id = coalesce(new.event_id, old.event_id)), 0),
    feedback_count = (select count(*) from event_feedback where event_id = coalesce(new.event_id, old.event_id))
  where id = coalesce(new.event_id, old.event_id);
  return null;
end;
$$;
create trigger event_feedback_sync
  after insert or update or delete on event_feedback
  for each row execute function public.sync_event_feedback();

create policy "event_feedback_select_public" on event_feedback for select using (true);
create policy "event_feedback_insert_own" on event_feedback for insert to authenticated
  with check (user_id = auth.uid() and is_checked_in_attendee(event_id));
create policy "event_feedback_update_own" on event_feedback for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_checked_in_attendee(event_id));
create policy "event_feedback_delete_own" on event_feedback for delete to authenticated
  using (user_id = auth.uid());

-- Same rate-limit posture as community_ratings (0010) -- the primary key
-- already caps spam to one row per event, but this closes the same
-- rapid-fire-across-many-events gap that motivated the original.
create index event_feedback_rate_limit_idx on event_feedback(user_id, created_at desc);
create function public.enforce_event_feedback_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from event_feedback
    where user_id = new.user_id and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'Submitting feedback too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger event_feedback_rate_limit
  before insert on event_feedback
  for each row execute function public.enforce_event_feedback_rate_limit();
