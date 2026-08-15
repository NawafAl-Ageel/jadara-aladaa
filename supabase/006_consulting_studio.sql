-- Jadara Consulting Platform — Phase 4: Consulting Studio MVP (no AI, no publish yet).
-- Run in the Supabase SQL editor for project gjuzaafqfsvmxhumpokp, after 005_proposals.sql.
-- Safe to re-run. Additive only.

-- ============================================================
-- consulting_templates — seeded with exactly one row for MVP, per the
-- brief ("build one excellent template, not many"). default_sections is
-- kept for future template-authoring tooling but is NOT read by the app
-- today — admin/js/modules/studio/constants.js's SECTION_DEFS is the
-- single source of truth the wizard actually uses when creating a
-- deliverable's sections. Deliberately not trying to keep two section
-- lists (DB jsonb + JS constant) in sync — that's a guaranteed drift bug.
-- ============================================================
create table if not exists consulting_templates (
  id bigserial primary key,
  key text not null unique,
  name_ar text not null,
  name_en text,
  description text,
  default_sections jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table consulting_templates enable row level security;

drop policy if exists "consulting_templates_staff_read" on consulting_templates;
create policy "consulting_templates_staff_read" on consulting_templates
  for select to authenticated using (true);

insert into consulting_templates (key, name_ar, name_en, description)
values ('market_analysis', 'تحليل السوق وخريطة الفرص', 'Market Analysis and Opportunity Map',
  'تحليل بيانات الفرص والمنافسين والجهات الحكومية لأي قطاع، وعرضها في تقرير تفاعلي للعميل.')
on conflict (key) do nothing;

-- ============================================================
-- consulting_deliverables — the report itself. Publish-related fields
-- (slug, visibility, password_hash, published_at/by) are deliberately not
-- added yet — they belong to Phase 6 and would be dead schema until then.
-- ============================================================
create table if not exists consulting_deliverables (
  id bigserial primary key,
  client_id bigint references clients(id),
  project_id bigint references projects(id),
  template_id bigint not null references consulting_templates(id),
  name text not null,
  internal_description text,
  language text not null default 'ar' check (language in ('ar', 'en')),
  reporting_period text,
  logo_url text,
  brand_primary text,
  brand_secondary text,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  owner_id uuid references profiles(id),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_consulting_deliverables_client on consulting_deliverables (client_id) where deleted_at is null;
create index if not exists idx_consulting_deliverables_status on consulting_deliverables (status) where deleted_at is null;

alter table consulting_deliverables enable row level security;

drop policy if exists "consulting_deliverables_staff_all" on consulting_deliverables;
create policy "consulting_deliverables_staff_all" on consulting_deliverables
  for all to authenticated using (true) with check (true);

-- ============================================================
-- consulting_datasets — uploaded/mapped data, one active dataset per
-- deliverable for MVP. Rows stored as JSONB (already mapped to canonical
-- field names, e.g. "estimated_value" not the client's original column
-- header) rather than a fully normalized rows table — a dataset is at
-- most a few thousand rows, JSONB is simpler and entirely sufficient at
-- that scale, and this is what keeps the same template industry-agnostic.
-- ============================================================
create table if not exists consulting_datasets (
  id bigserial primary key,
  deliverable_id bigint not null references consulting_deliverables(id) on delete cascade,
  source_type text not null default 'upload' check (source_type in ('upload', 'manual', 'reuse')),
  file_name text,
  column_map jsonb not null default '{}',
  rows jsonb not null default '[]',
  row_count int not null default 0,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_consulting_datasets_deliverable on consulting_datasets (deliverable_id);

alter table consulting_datasets enable row level security;

drop policy if exists "consulting_datasets_staff_all" on consulting_datasets;
create policy "consulting_datasets_staff_all" on consulting_datasets
  for all to authenticated using (true) with check (true);

-- ============================================================
-- consulting_sections — per-deliverable section configuration, materialized
-- from SECTION_DEFS (JS) when a deliverable is created, then freely
-- edited/reordered/toggled per deliverable from there on.
-- ============================================================
create table if not exists consulting_sections (
  id bigserial primary key,
  deliverable_id bigint not null references consulting_deliverables(id) on delete cascade,
  section_key text not null,
  kind text not null check (kind in ('cover', 'narrative', 'data')),
  title text not null,
  description text,
  enabled boolean not null default true,
  sort_order int not null default 0,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deliverable_id, section_key)
);

create index if not exists idx_consulting_sections_deliverable on consulting_sections (deliverable_id, sort_order);

alter table consulting_sections enable row level security;

drop policy if exists "consulting_sections_staff_all" on consulting_sections;
create policy "consulting_sections_staff_all" on consulting_sections
  for all to authenticated using (true) with check (true);
