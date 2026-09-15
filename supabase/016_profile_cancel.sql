-- Jadara — let a profiling run be stopped.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- A run that is clearly going the wrong way — wrong entity, a name that turned
-- out to be ambiguous, or simply no longer wanted — costs money for as long as
-- it keeps going. Stopping it needs a status of its own: marking it 'failed'
-- would be a lie, and 'done' would leave an empty profile looking finished.
--
-- Exa bills for what accrued before the cancel, so a stopped run may still show
-- a cost. That's recorded rather than hidden.

alter table entity_profiles drop constraint if exists entity_profiles_status_check;
alter table entity_profiles add constraint entity_profiles_status_check
  check (status in ('queued', 'researching', 'done', 'failed', 'cancelled'));
