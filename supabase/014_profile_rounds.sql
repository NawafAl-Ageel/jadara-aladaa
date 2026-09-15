-- Jadara — make profiling runs resumable across invocations.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- The first real run died at ~15 minutes with the row stuck on "researching".
-- Cause: an Edge Function invocation has a wall-clock ceiling of a few
-- minutes, and EdgeRuntime.waitUntil extends work past the *response* but not
-- past that ceiling. A single long research run is therefore killed silently —
-- no error, no completion, just a row that never changes again.
--
-- So a run is now a sequence of short rounds instead of one long one. Each
-- invocation does one model turn, appends to the stored conversation, and
-- hands off to the next; every round fits well inside the ceiling while the
-- run as a whole can take as long as it needs.

alter table entity_profiles add column if not exists conversation jsonb not null default '[]';
alter table entity_profiles add column if not exists round int not null default 0;
alter table entity_profiles add column if not exists stage text not null default 'research'
  check (stage in ('research', 'structuring', 'complete'));

-- Lets the UI tell "still working" from "stopped moving": if this hasn't
-- advanced in a few minutes, the run stalled rather than being slow.
alter table entity_profiles add column if not exists progress_at timestamptz;
