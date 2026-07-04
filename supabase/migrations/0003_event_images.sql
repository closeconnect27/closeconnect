-- event_images: a small gallery (2-3 photos) per event, separate from the
-- single events.cover_image_url. UI (upload flow + gallery display) is
-- Phase 7 work once the event creation/detail pages exist -- this is the
-- schema/RLS piece only, added now so it's not forgotten.
create table event_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  image_url text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index event_images_event_id_idx on event_images(event_id);

-- Defense in depth alongside the client-side cap in the future upload UI --
-- an API client bypassing the UI shouldn't be able to exceed the limit.
create function public.enforce_event_images_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from event_images where event_id = new.event_id) >= 3 then
    raise exception 'An event can have at most 3 images';
  end if;
  return new;
end;
$$;

create trigger event_images_limit
  before insert on event_images
  for each row execute function public.enforce_event_images_limit();

alter table event_images enable row level security;

-- Matches events' own RLS rules exactly: public read, host-only write.
create policy "event_images_select_public" on event_images for select using (true);
create policy "event_images_insert_host" on event_images for insert to authenticated
  with check (is_event_host(event_id));
create policy "event_images_update_host" on event_images for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));
create policy "event_images_delete_host" on event_images for delete to authenticated
  using (is_event_host(event_id));
