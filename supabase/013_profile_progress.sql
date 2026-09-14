-- Jadara — live progress for profiling runs.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- A research run takes minutes with nothing to show for it. Rather than an
-- animated bar that invents a percentage, the job writes what it is actually
-- doing after each search round, and the UI reports that alongside elapsed
-- time — real signal instead of decorative motion.
alter table entity_profiles add column if not exists progress_note text;
