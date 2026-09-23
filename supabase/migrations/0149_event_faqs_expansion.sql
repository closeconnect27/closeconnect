-- Expands event_faqs (0144, built earlier this session as a plain
-- question/answer child list) to the fuller organizer-managed FAQ system:
-- categories, publish/draft state, ownership attribution, and admin
-- moderation -- without losing any FAQ rows already saved.
alter table event_faqs add column category text not null default 'general'
  check (category in ('general', 'tickets', 'timing', 'location', 'parking', 'food_drinks', 'age_restrictions', 'accessibility', 'what_to_bring', 'venue', 'rules', 'cancellation', 'refunds', 'other'));
alter table event_faqs add column is_published boolean not null default true;
alter table event_faqs add column created_by uuid references auth.users(id) on delete set null;
alter table event_faqs add column updated_by uuid references auth.users(id) on delete set null;
-- Admin moderation (section 43): hides an FAQ from public view without
-- deleting organizer content outright, and without silently rewriting it
-- -- the organizer's own question/answer text is left untouched, this is
-- purely a visibility flag an admin can set/unset.
alter table event_faqs add column is_hidden_by_admin boolean not null default false;
alter table event_faqs add column created_at timestamptz not null default now();
alter table event_faqs add column updated_at timestamptz not null default now();

-- Public/attendee visibility now also requires is_published and not
-- is_hidden_by_admin -- replaces 0144's plain "using (true)" policy. The
-- host's own edit screen and admin's moderation view both need to see
-- unpublished/hidden rows too, so this is a three-way OR, not a stricter
-- public-only policy.
drop policy "event_faqs_select_public" on event_faqs;
create policy "event_faqs_select_visible_or_owner_or_admin" on event_faqs for select
  using ((is_published and not is_hidden_by_admin) or is_event_host(event_id) or is_admin());

-- Host can still fully manage their own event's FAQs (question/answer/
-- category/order/publish state) via the existing insert/update/delete
-- host policies from 0144 -- unchanged. is_hidden_by_admin is additionally
-- protected by the trigger below so a host can never clear a moderation
-- flag an admin set.
create or replace function public.protect_event_faq_admin_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    new.is_hidden_by_admin := old.is_hidden_by_admin;
  end if;
  return new;
end;
$$;

create trigger event_faqs_protect_moderation
  before update on event_faqs
  for each row execute function public.protect_event_faq_admin_moderation();

-- Admin also needs a write path to actually set is_hidden_by_admin in the
-- first place -- 0144 only ever granted host writes.
create policy "event_faqs_admin_moderate" on event_faqs for update to authenticated
  using (is_admin()) with check (is_admin());
