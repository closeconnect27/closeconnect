-- "Seen" receipts need each participant to read the OTHER participant's
-- last_read_at for a shared thread -- dm_reads_select_own (0074) only ever
-- allowed a caller to see their own marker. This adds a second, purely
-- additive policy (RLS ORs permissive policies, so nothing existing gets
-- more restrictive): any participant of a thread can see every read marker
-- recorded for that thread, reusing 0124's is_dm_thread_participant
-- dispatcher across all three DM kinds.
create policy "dm_reads_select_thread_participant" on dm_reads for select to authenticated
  using (is_dm_thread_participant(thread_kind, thread_id));
