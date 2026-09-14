-- Jadara — let the agent research Jadara itself, with provenance.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- The agent already researches the *client* entity. This lets it research its
-- own firm too — but the two are not equivalent in what they can establish.
-- Public sources can show services, accreditations, published clients and
-- market positioning. They cannot show how many consultants hold an EFQM
-- assessor certificate or who is free for an 8-month on-site deployment, and
-- those are precisely the facts that decide the tenders in hand (HRDF كراسة
-- 354030 requires 2 × EFQM-certified with 10 years; إنفاذ requires KAQA
-- assessors, 2 of them on-site for 8 months).
--
-- So every row carries where it came from. A researched claim must never be
-- scored as a confirmed capability.

alter table jadara_capabilities
  add column if not exists source text not null default 'seeded'
    check (source in ('seeded', 'public_research', 'confirmed'));

alter table jadara_capabilities add column if not exists verified boolean not null default false;
alter table jadara_capabilities add column if not exists source_url text;
alter table jadara_capabilities add column if not exists researched_at timestamptz;

-- Rows seeded from Jadara's own Go/No-Go decks are asserted by Jadara, but no
-- one has confirmed them against the current roster, so they stay unverified.
update jadara_capabilities set source = 'seeded' where source is null;

create index if not exists idx_jadara_capabilities_verified on jadara_capabilities (verified);

-- ============================================================
-- jadara_profile — the firm's public-facing profile, researched rather than
-- typed. Single row (id = 1). Kept separate from jadara_capabilities: this is
-- narrative used for positioning and competitive sections, while capabilities
-- is the roster used for the requirement-match table.
-- ============================================================
create table if not exists jadara_profile (
  id int primary key default 1,
  legal_name text,
  summary text,
  services text[] not null default '{}',
  accreditations text[] not null default '{}',
  published_clients text[] not null default '{}',
  positioning text,
  limitations text[] not null default '{}',
  sources text[] not null default '{}',
  researched_at timestamptz,
  researched_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  constraint jadara_profile_singleton check (id = 1)
);

alter table jadara_profile enable row level security;

drop policy if exists "jadara_profile_staff_all" on jadara_profile;
create policy "jadara_profile_staff_all" on jadara_profile
  for all to authenticated using (true) with check (true);
