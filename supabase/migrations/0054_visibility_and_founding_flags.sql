-- Owner-controlled toggle for the member COUNT (distinct from
-- members_list_visible, 0052, which hides the actual roster) -- some
-- owners want the number itself hidden (a vanity-metric concern, e.g. a
-- small new community not wanting to visibly show "3 members"), shown on
-- CommunityCard and the community detail page header. Owner/staff always
-- see the real number regardless, same convention as 0052.
alter table communities add column member_count_visible boolean not null default true;

-- Founding cohort markers -- admin-curated, not auto-computed. Deliberately
-- a manual admin toggle rather than a count/date cutoff rule: a founding
-- cohort is a curated relationship with the platform's first real
-- organizers, not a mechanical threshold. Grandfathers whatever free
-- perks get attached to these flags later (e.g. a future ticketing fee or
-- Community Pro paywall checks this first).
alter table communities add column is_founding boolean not null default false;
alter table profiles add column is_founding_host boolean not null default false;

-- Host rating (profiles.host_rating, 0001) has been dead code since it was
-- added -- displayed but never computed. Pairs with it the same way
-- rating_count pairs with avg_rating on communities: lets the UI tell "0
-- because genuinely no reviews yet" (show a "New host" label) apart from
-- "0 because the average really is low" (show the real number).
alter table profiles add column host_rating_count int not null default 0;

-- Recomputes one host's rating from every event_feedback row on every
-- event they've hosted (not just one event) -- host_rating is a
-- cross-event reputation signal, unlike events.avg_feedback_rating (0042)
-- which stays per-event. security definer: event_feedback has no public
-- select policy of its own broad enough for this aggregate, matching the
-- sync pattern already used for community ratings/event feedback.
create function public.sync_host_rating(p_host_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set
    host_rating = coalesce((
      select round(avg(ef.rating)::numeric, 1)
      from event_feedback ef
      join events e on e.id = ef.event_id
      where e.host_id = p_host_id
    ), 0),
    host_rating_count = (
      select count(*)
      from event_feedback ef
      join events e on e.id = ef.event_id
      where e.host_id = p_host_id
    )
  where id = p_host_id;
end;
$$;

-- Resolves the affected host through events (event_feedback has no
-- host_id column of its own) before recomputing -- coalesce(new, old)
-- covers delete (new is null) the same way sync_event_feedback (0042)
-- does for events.avg_feedback_rating.
create function public.trigger_sync_host_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_host_id uuid;
begin
  select host_id into v_host_id from events where id = coalesce(new.event_id, old.event_id);
  if v_host_id is not null then
    perform public.sync_host_rating(v_host_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger event_feedback_sync_host_rating
after insert or update or delete on event_feedback
for each row execute function public.trigger_sync_host_rating();
