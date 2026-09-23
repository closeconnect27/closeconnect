-- Global, admin-managed CloseConnect FAQ -- database-driven (never
-- hardcoded into a component/template) so admins can add/edit/reorder/
-- publish without a code deploy. Separate from event_faqs (0144, extended
-- below): this answers "how does CloseConnect work", an event's own FAQ
-- answers "what time should I arrive at THIS event" -- the two are never
-- mixed on either the public /faqs page or an event page.
create table platform_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 4000),
  category text not null default 'other'
    check (category in ('getting_started', 'account', 'events', 'tickets', 'payments', 'cancellation_refunds', 'organizers', 'payouts', 'safety', 'other')),
  display_order int not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index platform_faqs_category_idx on platform_faqs(category, display_order);

alter table platform_faqs enable row level security;

-- Public sees published only; an admin previewing drafts (spec section 26:
-- "Preview") sees everything.
create policy "platform_faqs_select_published_or_admin" on platform_faqs for select
  using (is_published or is_admin());

create policy "platform_faqs_admin_manage" on platform_faqs for all to authenticated
  using (is_admin()) with check (is_admin());
