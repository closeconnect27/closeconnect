-- Fixes the FK gap found while testing Phase 7 (form_responses.ticket_type_id
-- had no ON DELETE action, so deleting an event with registrations failed
-- once event_ticket_types cascaded out from under it). SET NULL over CASCADE:
-- a registration record is history -- it should survive a ticket type being
-- removed later, not disappear with it. The registrant's own response_data
-- (name/email/answers) is untouched; only the now-dangling ticket_type_id
-- reference is cleared.
alter table form_responses drop constraint form_responses_ticket_type_id_fkey;
alter table form_responses add constraint form_responses_ticket_type_id_fkey
  foreign key (ticket_type_id) references event_ticket_types(id) on delete set null;
