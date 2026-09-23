-- Event add-ons: optional paid extras an attendee can add to their ticket
-- at checkout (e.g. "T-shirt +Rs 200", "Parking pass +Rs 100"). Same simple
-- repeatable-child-list shape as event_ticket_types, but deliberately NOT
-- frozen after registrations exist (0120's own freeze is ticket-types-only)
-- -- an organizer can add/adjust add-ons at any time; a historical booking
-- is protected by its own price snapshot below (form_response_addons),
-- the same principle cancellation_policy_snapshot already uses, not by
-- locking the parent row.
create table event_addons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  name text not null check (char_length(name) between 1 and 120),
  price numeric(10,2) not null default 0 check (price >= 0),
  quantity_available int,
  -- Lets a host retire an add-on (stop selling it) without deleting it out
  -- from under registrations that already bought it -- deleting would
  -- null out addon_id on every form_response_addons row referencing it
  -- (on delete set null below), losing which specific add-on a historical
  -- order was for even though name_snapshot/unit_price_paise still record
  -- what it cost.
  is_active boolean not null default true,
  sort_order int default 0
);
create index event_addons_event_id_idx on event_addons(event_id);

alter table event_addons enable row level security;

create policy "event_addons_select_public" on event_addons for select using (true);

create policy "event_addons_insert_host" on event_addons for insert to authenticated
  with check (is_event_host(event_id));

create policy "event_addons_update_host" on event_addons for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));

create policy "event_addons_delete_host" on event_addons for delete to authenticated
  using (is_event_host(event_id));

-- =========================================================================
-- REGISTRATION-SIDE: which add-ons a registration bought, and at what price
-- =========================================================================
-- One row per add-on selected on a registration (not a jsonb array on
-- form_responses) -- so enforce_addon_capacity below can sum quantities
-- per add-on with a plain indexed query, same reasoning form_responses'
-- own ticket_type_id/quantity columns already establish for capacity
-- checks, rather than needing to unpack jsonb per row.
create table form_response_addons (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references form_responses(id) on delete cascade not null,
  addon_id uuid references event_addons(id) on delete set null,
  -- Snapshot, not a live join to event_addons -- an organizer editing an
  -- add-on's name/price later must never retroactively change what a
  -- past order shows it paid for, same snapshot principle as
  -- cancellation_policy_snapshot.
  name_snapshot text not null,
  unit_price_paise integer not null check (unit_price_paise >= 0),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);
create index form_response_addons_registration_idx on form_response_addons(registration_id);
create index form_response_addons_addon_idx on form_response_addons(addon_id);

alter table form_response_addons enable row level security;

-- Same visibility as the parent form_responses row: the respondent
-- themselves, the event's host, or an admin.
create policy "form_response_addons_select_own_or_host_or_admin" on form_response_addons for select to authenticated
  using (exists (
    select 1 from form_responses fr
    join events e on e.id = fr.owner_id
    where fr.id = form_response_addons.registration_id
      and fr.owner_type = 'event'
      and (fr.respondent_id = auth.uid() or e.host_id = auth.uid() or is_admin())
  ));

-- Only the registration's own respondent can insert a row for it, and
-- only for themselves -- registerForEvent runs under the caller's own
-- RLS-scoped client (not the admin client), same posture as the parent
-- form_responses insert itself. No update policy (an order's add-ons are
-- immutable once placed -- cancel and re-register to change them) and no
-- delete policy for `authenticated` (cascades with the parent registration).
create policy "form_response_addons_insert_self" on form_response_addons for insert to authenticated
  with check (exists (select 1 from form_responses fr where fr.id = registration_id and fr.respondent_id = auth.uid()));

-- =========================================================================
-- INVENTORY: same advisory-lock capacity pattern as enforce_ticket_capacity
-- =========================================================================
create or replace function public.enforce_addon_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_capacity integer;
  v_registered integer;
begin
  if new.addon_id is null then
    return new;
  end if;

  select quantity_available into v_capacity from event_addons where id = new.addon_id;
  if v_capacity is null then
    return new; -- unlimited
  end if;

  perform pg_advisory_xact_lock(hashtext(new.addon_id::text));

  select coalesce(sum(fra.quantity), 0) into v_registered
    from form_response_addons fra
    join form_responses fr on fr.id = fra.registration_id
    where fra.addon_id = new.addon_id and fr.status <> 'cancelled';

  if v_registered + new.quantity > v_capacity then
    raise exception 'This add-on is sold out.';
  end if;

  return new;
end;
$$;

create trigger addon_capacity_check
  before insert on form_response_addons
  for each row execute function public.enforce_addon_capacity();
