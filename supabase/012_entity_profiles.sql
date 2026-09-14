-- Jadara — the profiling agent: deep research on any client entity.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- Deep research on an entity like "وزارة الطاقة" runs far longer than an Edge
-- Function may hold a request open, so a run is a job, not a request: the
-- function returns a row id immediately and keeps working in the background,
-- writing the result here when it finishes. The UI polls this table.
--
-- Errors are recorded rather than thrown away — a run that dies in the
-- background is otherwise invisible, and a profile that silently never
-- arrives is worse than one that reports why it failed.

create table if not exists entity_profiles (
  id bigserial primary key,

  entity_name text not null,
  aliases text[] not null default '{}',

  -- Whatever the user already had: pasted reports, notes, links, prior
  -- correspondence. Given to the agent as a starting point, and kept so a
  -- profile can be re-run later against the same inputs.
  provided_context text,

  status text not null default 'queued'
    check (status in ('queued', 'researching', 'done', 'failed')),
  error text,

  profile jsonb,
  sources jsonb not null default '[]',
  search_count int,

  generated_by_model text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_entity_profiles_created on entity_profiles (created_at desc) where deleted_at is null;
create index if not exists idx_entity_profiles_name on entity_profiles (entity_name) where deleted_at is null;
create index if not exists idx_entity_profiles_status on entity_profiles (status) where deleted_at is null;

alter table entity_profiles enable row level security;

drop policy if exists "entity_profiles_staff_all" on entity_profiles;
create policy "entity_profiles_staff_all" on entity_profiles
  for all to authenticated using (true) with check (true);

-- A Go/No-Go can reuse a profile already researched for the same entity
-- instead of paying for the research twice.
alter table gonogo_assessments add column if not exists entity_profile_id bigint references entity_profiles(id);
