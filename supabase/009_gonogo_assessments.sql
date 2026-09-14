-- Jadara — Go/No-Go assessment engine (the Agent's second section).
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first, production only
-- after it's verified there. Safe to re-run. Additive only.

-- ============================================================
-- gonogo_criteria — the fixed weighted scoring model, derived from four
-- real Jadara assessments (DAN_RFP_105, هيئة التأمين 2026513, إنفاذ, GSO
-- CAD-S-5). Weights were identical in all four; only the decision bands
-- differed, so those are standardized in gonogo_decision_band() below.
-- Kept as a table rather than a JS constant because the cross-assessment
-- averages are computed in SQL and need to join against it.
-- ============================================================
create table if not exists gonogo_criteria (
  key text primary key,
  label_ar text not null,
  weight numeric(4,3) not null,
  inverted boolean not null default false,
  sort_order int not null default 0
);

insert into gonogo_criteria (key, label_ar, weight, inverted, sort_order) values
  ('strategic_alignment',  'التوافق الاستراتيجي',    0.25, false, 1),
  ('capability_readiness', 'جاهزية القدرات',          0.25, false, 2),
  ('commercial_value',     'الجاذبية التجارية',        0.20, false, 3),
  ('risk',                 'المخاطر (معكوسة)',        0.15, true,  4),
  ('win_probability',      'احتمالية الفوز',           0.15, false, 5)
on conflict (key) do update set
  label_ar = excluded.label_ar,
  weight = excluded.weight,
  inverted = excluded.inverted,
  sort_order = excluded.sort_order;

-- ============================================================
-- gonogo_assessments — one row per RFP assessed. `content` holds the full
-- generated narrative (executive summary, scope, risk matrix, SWOT,
-- recommendation, consultant opinion) for rendering; the columns above it
-- are the fields worth querying, filtering and reporting on.
-- ============================================================
create table if not exists gonogo_assessments (
  id bigserial primary key,

  entity_name text not null,
  project_title text,
  rfp_reference text,
  sector text,
  opportunity_type text,
  submission_deadline date,
  request_date date,
  expected_duration text,

  estimated_value_min numeric(14,2),
  estimated_value_max numeric(14,2),
  win_probability_min int,
  win_probability_max int,

  total_score numeric(5,2),
  decision text check (decision in ('go', 'go_with_conditions', 'borderline', 'no_go')),

  content jsonb not null default '{}',

  -- Provenance: what the model was given and which model produced it, so a
  -- past assessment can be audited or re-run rather than trusted blindly.
  source_text text,
  entity_profile jsonb,
  generated_by_model text,

  status text not null default 'draft' check (status in ('draft', 'final')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_gonogo_assessments_created on gonogo_assessments (created_at desc) where deleted_at is null;
create index if not exists idx_gonogo_assessments_decision on gonogo_assessments (decision) where deleted_at is null;
create index if not exists idx_gonogo_assessments_entity on gonogo_assessments (entity_name) where deleted_at is null;

-- ============================================================
-- gonogo_scores — per-criterion score, one row each. Deliberately NOT
-- nested inside gonogo_assessments.content: the whole point of the
-- benchmark feature ("you scored 7, the average across all assessments is
-- 6.47") is a cheap aggregate, and that needs rows, not JSON.
-- ============================================================
create table if not exists gonogo_scores (
  id bigserial primary key,
  assessment_id bigint not null references gonogo_assessments(id) on delete cascade,
  criterion_key text not null references gonogo_criteria(key),
  score numeric(4,2) not null check (score >= 0 and score <= 10),
  rationale text,
  created_at timestamptz not null default now(),
  unique (assessment_id, criterion_key)
);

create index if not exists idx_gonogo_scores_criterion on gonogo_scores (criterion_key);

-- ============================================================
-- gonogo_criteria_averages — the benchmark each assessment is compared
-- against. security_invoker so the caller's RLS applies rather than the
-- view owner's.
-- ============================================================
create or replace view gonogo_criteria_averages
with (security_invoker = true) as
select
  c.key,
  c.label_ar,
  c.weight,
  c.sort_order,
  round(avg(s.score), 2) as average_score,
  count(s.score) as sample_size
from gonogo_criteria c
left join (
  select s.criterion_key, s.score
  from gonogo_scores s
  join gonogo_assessments a on a.id = s.assessment_id
  where a.deleted_at is null
) s on s.criterion_key = c.key
group by c.key, c.label_ar, c.weight, c.sort_order;

-- ============================================================
-- Standardized decision bands. The four source decks disagreed (75/55,
-- 60/50, and 80/60/40); this uses the 80/60/40 scheme, the only one that
-- matches the verdict actually written on all four decks — notably هيئة
-- التأمين scored 70.25, which its own band table called "مشاركة" while the
-- slide said "مشاركة بشروط".
-- ============================================================
create or replace function gonogo_decision_band(p_score numeric)
returns text
language sql
immutable
as $$
  select case
    when p_score >= 80 then 'go'
    when p_score >= 60 then 'go_with_conditions'
    when p_score >= 40 then 'borderline'
    else 'no_go'
  end;
$$;

alter table gonogo_criteria enable row level security;
alter table gonogo_assessments enable row level security;
alter table gonogo_scores enable row level security;

drop policy if exists "gonogo_criteria_staff_read" on gonogo_criteria;
create policy "gonogo_criteria_staff_read" on gonogo_criteria
  for select to authenticated using (true);

drop policy if exists "gonogo_assessments_staff_all" on gonogo_assessments;
create policy "gonogo_assessments_staff_all" on gonogo_assessments
  for all to authenticated using (true) with check (true);

drop policy if exists "gonogo_scores_staff_all" on gonogo_scores;
create policy "gonogo_scores_staff_all" on gonogo_scores
  for all to authenticated using (true) with check (true);
