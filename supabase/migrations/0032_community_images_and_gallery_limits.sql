-- Bump the event gallery cap from 3 to 5 (product request) -- same trigger,
-- same shape, just a higher ceiling.
create or replace function public.enforce_event_images_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from event_images where event_id = new.event_id) >= 5 then
    raise exception 'An event can have at most 5 images';
  end if;
  return new;
end;
$$;

-- community_images: a new gallery table mirroring event_images exactly --
-- communities previously had only a single logo + single cover, no gallery
-- at all. Same shape, same RLS pattern (public read, staff-only write),
-- same defense-in-depth cap enforced in the DB alongside the client cap.
create table community_images (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  image_url text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index community_images_community_id_idx on community_images(community_id);

create function public.enforce_community_images_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from community_images where community_id = new.community_id) >= 5 then
    raise exception 'A community can have at most 5 images';
  end if;
  return new;
end;
$$;

create trigger community_images_limit
  before insert on community_images
  for each row execute function public.enforce_community_images_limit();

alter table community_images enable row level security;

create policy "community_images_select_public" on community_images for select using (true);
create policy "community_images_insert_staff" on community_images for insert to authenticated
  with check (is_community_staff(community_id));
create policy "community_images_update_staff" on community_images for update to authenticated
  using (is_community_staff(community_id)) with check (is_community_staff(community_id));
create policy "community_images_delete_staff" on community_images for delete to authenticated
  using (is_community_staff(community_id));
