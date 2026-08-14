-- Jadara Consulting Platform — Phase 2: clients module, projects, attachments/Storage.
-- Run in the Supabase SQL editor for project gjuzaafqfsvmxhumpokp, after 003_leads_pipeline.sql.
-- Safe to re-run. Additive only.

-- ============================================================
-- client_activities — mirrors lead_activities; clients persist for the life
-- of the relationship so they get a real timeline too (unlike projects,
-- see below, which intentionally have no dedicated activity table for MVP).
-- ============================================================
create table if not exists client_activities (
  id bigserial primary key,
  client_id bigint not null references clients(id) on delete cascade,
  type text not null check (type in (
    'created','status_changed','note','call','email','meeting','follow_up_scheduled',
    'attachment_uploaded','proposal_created','proposal_sent','project_created'
  )),
  title text not null,
  description text,
  user_id uuid references profiles(id),
  related_object jsonb,
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_activities_client on client_activities (client_id, created_at desc);

alter table client_activities enable row level security;

drop policy if exists "client_activities_staff_read" on client_activities;
create policy "client_activities_staff_read" on client_activities
  for select to authenticated using (true);

drop policy if exists "client_activities_staff_insert" on client_activities;
create policy "client_activities_staff_insert" on client_activities
  for insert to authenticated with check (true);

-- ============================================================
-- projects — lightweight tracking, not a Jira replacement. No dedicated
-- project_activities/history table for MVP (deliberately out of scope —
-- audit_logs was considered but its RLS is admin-only by design, which
-- would silently hide history from the project managers/consultants who
-- actually need to see it); milestones/tasks/deliverables below carry
-- their own timestamps, which covers "what happened when" well enough.
-- ============================================================
create sequence if not exists projects_project_number_seq;

create table if not exists projects (
  id bigserial primary key,
  project_number text,
  client_id bigint not null references clients(id),
  name text not null,
  manager_id uuid references profiles(id),
  service text,
  description text,
  scope text,
  start_date date,
  target_end_date date,
  actual_end_date date,
  status text not null default 'planning' check (status in ('planning','active','on_hold','completed','cancelled')),
  health text not null default 'on_track' check (health in ('on_track','at_risk','delayed')),
  progress int not null default 0 check (progress between 0 and 100),
  source_lead_id bigint references leads(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function public.assign_project_number()
returns trigger
language plpgsql
as $$
begin
  if new.project_number is null then
    new.project_number := 'P-' || lpad(nextval('projects_project_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_project_number on projects;
create trigger trg_assign_project_number
  before insert on projects
  for each row execute function public.assign_project_number();

create unique index if not exists idx_projects_number_unique on projects (project_number);
create index if not exists idx_projects_client on projects (client_id) where deleted_at is null;
create index if not exists idx_projects_status on projects (status) where deleted_at is null;
-- Dedupe guard mirroring clients.source_lead_id: a lead can only spawn one project.
create unique index if not exists idx_projects_source_lead_unique on projects (source_lead_id) where source_lead_id is not null;

alter table projects enable row level security;

drop policy if exists "projects_staff_all" on projects;
create policy "projects_staff_all" on projects
  for all to authenticated using (true) with check (true);

-- Link leads -> the project they spawned (mirrors converted_to_client_id).
alter table leads add column if not exists converted_to_project_id bigint;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints where constraint_name = 'leads_converted_project_fk'
  ) then
    alter table leads add constraint leads_converted_project_fk
      foreign key (converted_to_project_id) references projects(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- project_members / milestones / tasks / deliverable checklist
-- ============================================================
create table if not exists project_members (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id),
  role_on_project text,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists idx_project_members_project on project_members (project_id);
alter table project_members enable row level security;
drop policy if exists "project_members_staff_all" on project_members;
create policy "project_members_staff_all" on project_members
  for all to authenticated using (true) with check (true);

create table if not exists project_milestones (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'upcoming' check (status in ('upcoming','in_progress','done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_milestones_project on project_milestones (project_id, sort_order);
alter table project_milestones enable row level security;
drop policy if exists "project_milestones_staff_all" on project_milestones;
create policy "project_milestones_staff_all" on project_milestones
  for all to authenticated using (true) with check (true);

create table if not exists project_tasks (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  milestone_id bigint references project_milestones(id) on delete set null,
  title text not null,
  assignee_id uuid references profiles(id),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  due_date date,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_tasks_project on project_tasks (project_id);
alter table project_tasks enable row level security;
drop policy if exists "project_tasks_staff_all" on project_tasks;
create policy "project_tasks_staff_all" on project_tasks
  for all to authenticated using (true) with check (true);

create table if not exists project_deliverable_items (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  name text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','delivered')),
  link_url text,
  due_date date,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_deliverable_items_project on project_deliverable_items (project_id);
alter table project_deliverable_items enable row level security;
drop policy if exists "project_deliverable_items_staff_all" on project_deliverable_items;
create policy "project_deliverable_items_staff_all" on project_deliverable_items
  for all to authenticated using (true) with check (true);

-- ============================================================
-- attachments — one generic polymorphic table reused across leads/clients/
-- projects (and proposals/deliverables in later phases), backed by a new
-- Supabase Storage bucket. First use of Storage in this app.
-- ============================================================
create table if not exists attachments (
  id bigserial primary key,
  owner_type text not null check (owner_type in ('lead','client','project','proposal','consulting_deliverable')),
  owner_id bigint not null,
  file_url text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_attachments_owner on attachments (owner_type, owner_id);

alter table attachments enable row level security;

drop policy if exists "attachments_staff_all" on attachments;
create policy "attachments_staff_all" on attachments
  for all to authenticated using (true) with check (true);

-- Storage bucket for uploaded files. Not public — reads go through the
-- authenticated API, matching the RLS-gated model used everywhere else.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- storage.objects has RLS enabled by default on every Supabase project;
-- no ALTER needed here, only the policies scoped to this bucket.
drop policy if exists "documents_staff_read" on storage.objects;
create policy "documents_staff_read" on storage.objects
  for select to authenticated using (bucket_id = 'documents');

drop policy if exists "documents_staff_insert" on storage.objects;
create policy "documents_staff_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');

drop policy if exists "documents_staff_delete" on storage.objects;
create policy "documents_staff_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'documents');
