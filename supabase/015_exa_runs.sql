-- Jadara — move profiling research onto Exa's Agent API.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- Researching with Claude's web_search meant we owned the long-running loop,
-- which an Edge Function invocation cannot hold — hence the round-chaining in
-- 014 and the run that died at fifteen minutes. Exa runs the research on its
-- own infrastructure and hands back a run id, so our function only ever does
-- two quick things: start a run, or check on one.
--
-- A useful consequence: the research no longer depends on anyone keeping the
-- page open. Exa keeps working regardless; whenever someone next opens the
-- profile, one call ingests whatever finished in the meantime.
--
-- 014's `conversation` and `round` columns are left in place but are no longer
-- written — dropping them would be destructive for no gain, and old rows still
-- read correctly.

alter table entity_profiles add column if not exists exa_run_id text;
alter table entity_profiles add column if not exists exa_status text;
alter table entity_profiles add column if not exists exa_cost numeric(10,4);

-- Exa returns citations for the fields it fills; kept so the UI can show where
-- each claim came from rather than asking anyone to trust the profile blind.
alter table entity_profiles add column if not exists grounding jsonb;

create index if not exists idx_entity_profiles_exa_run on entity_profiles (exa_run_id) where exa_run_id is not null;
