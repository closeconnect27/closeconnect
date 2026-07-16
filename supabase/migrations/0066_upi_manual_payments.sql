-- Razorpay's per-registration Payment Links (0041) are being replaced as
-- the *active* payment path -- the platform's Razorpay account was
-- rejected. razorpay.ts, the webhook route, and RAZORPAY_* env vars are
-- deliberately left in place (nothing here drops or disables them) in
-- case the account is reinstated later; registerForEvent (app/actions/
-- events.ts) just stops calling createPaymentLink and takes this path
-- instead: show the host's own UPI QR code + UPI ID, collect whatever
-- reference number the registrant's UPI app gave them after paying by
-- hand, and let the host confirm it themselves -- there's no API into a
-- personal UPI account to verify this programmatically.

-- Deliberately its own table, not new columns on profiles/profile_details:
-- this needs to be readable by any authenticated registrant paying a host
-- (same audience a host would hand a screenshot of their QR to over
-- WhatsApp -- not sensitive beyond what the UPI ID itself already
-- exposes), which is a different, broader select policy than either
-- profiles or profile_details carries today. Keeping it separate means
-- not having to touch either of those policies to get there.
create table host_payment_details (
  id uuid primary key references profiles(id) on delete cascade,
  upi_id text,
  qr_image_url text,
  updated_at timestamptz default now()
);

alter table host_payment_details enable row level security;

create policy "host_payment_details_select_public" on host_payment_details for select
  using (true);
create policy "host_payment_details_insert_own" on host_payment_details for insert to authenticated
  with check (id = auth.uid());
create policy "host_payment_details_update_own" on host_payment_details for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- New middle state: a registrant has typed in the UPI reference their
-- payment app gave them, but the host hasn't confirmed it against their
-- own UPI history yet. 'unpaid' still means "hasn't even claimed to pay",
-- 'paid' still means host-confirmed -- everything that already reads
-- payment_status (funnel, payout tracking, the webhook) keeps working
-- unchanged since neither of those meanings moved.
alter table form_responses drop constraint form_responses_payment_status_check;
alter table form_responses add constraint form_responses_payment_status_check
  check (payment_status in ('unpaid', 'pending_verification', 'paid', 'failed'));

alter table form_responses add column payment_reference text;

-- form_responses_update_owner (0001) only lets the event's host update a
-- registration -- real gap found while building this: submitPaymentReference
-- is the REGISTRANT updating their own row (to hand over their UPI
-- reference), which that policy alone would silently block. Scoped tightly
-- to exactly that one transition (their own row, currently 'unpaid', moving
-- to 'pending_verification') via USING checking the pre-update row and WITH
-- CHECK checking the post-update row -- a respondent can't use this to jump
-- straight to 'paid' themselves, touch any other column's meaning, or touch
-- anyone else's registration.
create policy "form_responses_update_respondent_payment" on form_responses for update to authenticated
  using (respondent_id = auth.uid() and owner_type = 'event' and payment_status = 'unpaid')
  with check (respondent_id = auth.uid() and owner_type = 'event' and payment_status = 'pending_verification');

-- Path convention: {user_id}/{uuid}.ext, same shape as community-images
-- (0018) -- public bucket, since the whole point is a registrant needs to
-- actually see this image to pay.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "payment_qr_bucket_select_public" on storage.objects for select
  using (bucket_id = 'payment-qr');
create policy "payment_qr_bucket_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "payment_qr_bucket_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);

-- Two new in-app notification moments this flow needs -- host learns a
-- registrant claims to have paid, registrant learns the host confirmed it.
-- Both are genuinely cross-user (host notifying an event's host from the
-- registrant's own request, and vice versa), so -- same convention as
-- review_community_claim/approve_join_request -- this goes through a
-- security definer trigger rather than a direct insert under either
-- party's own RLS-scoped client. The "you're registered" *email* still
-- gets sent from the confirmPayment Server Action itself (this trigger
-- only ever fires from a plain UPDATE, and plpgsql here has no HTTP access
-- to actually send one).
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'claim_approved',
  'organizer_verified',
  'founding_marked',
  'event_message',
  'event_registered',
  'join_request_approved',
  'join_request_rejected',
  'join_request_pending',
  'new_follower',
  'follow_request_accepted',
  'followed_new_community',
  'followed_new_event',
  'payment_submitted',
  'payment_confirmed'
));

create function public.notify_payment_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_host_id uuid;
  v_event_name text;
  v_registrant_name text;
begin
  if new.owner_type <> 'event' then
    return new;
  end if;

  if new.payment_status = 'pending_verification' and old.payment_status is distinct from 'pending_verification' then
    select host_id, event_name into v_host_id, v_event_name from events where id = new.owner_id;
    if v_host_id is not null then
      v_registrant_name := coalesce(new.response_data->>'name', 'Someone');
      insert into notifications (user_id, type, title, body, link)
      values (v_host_id, 'payment_submitted', 'Payment submitted for review', v_registrant_name || ' says they paid for ' || v_event_name, '/events/' || new.owner_id || '/manage');
    end if;
  -- Only fires for the manual-confirm path (old status was
  -- 'pending_verification') -- the Razorpay webhook's direct 'unpaid' ->
  -- 'paid' transition (still dormant but left intact) already sends its
  -- own 'event_registered' notification itself, so this deliberately
  -- doesn't also fire for that path and double up.
  elsif new.payment_status = 'paid' and old.payment_status = 'pending_verification' then
    if new.respondent_id is not null then
      select event_name into v_event_name from events where id = new.owner_id;
      insert into notifications (user_id, type, title, body, link)
      values (new.respondent_id, 'payment_confirmed', 'Payment confirmed', 'You''re registered for ' || v_event_name, '/events/' || new.owner_id);
    end if;
  end if;

  return new;
end;
$$;
create trigger form_response_payment_status_changed
  after update on form_responses
  for each row
  when (new.payment_status is distinct from old.payment_status)
  execute function public.notify_payment_status_change();
