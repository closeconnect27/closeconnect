-- 1-message-per-2-seconds rate limit on group chat (SPEC.md Section 7/11).
-- Enforced here, not just client-side UX, since a client-only limit is
-- trivially bypassed by calling the API directly.
create index community_messages_rate_limit_idx on community_messages(group_id, user_id, created_at desc);

create function public.enforce_chat_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from community_messages
    where group_id = new.group_id
      and user_id = new.user_id
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Sending messages too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;

create trigger community_messages_rate_limit
  before insert on community_messages
  for each row execute function public.enforce_chat_rate_limit();
