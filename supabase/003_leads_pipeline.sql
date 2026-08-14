-- Jadara Consulting Platform — Phase 1: leads pipeline, activity timeline, clients (minimal).
-- Run in the Supabase SQL editor for project gjuzaafqfsvmxhumpokp, after 002_profiles_roles_audit.sql.
-- Safe to re-run. Additive only — no existing column/table is dropped or renamed.
--
-- Compatibility note: the public site's contact form (js/main.js) inserts only
-- name/company/job_title/service/email/phone/message into `leads`. Every new
-- column below has a safe default so that insert keeps working unchanged.

-- ============================================================
-- leads — extend with pipeline fields
-- ============================================================
alter table leads add column if not exists sales_stage text not null default 'new'
  check (sales_stage in ('new','contacted','qualified','proposal_sent','negotiation','won','lost'));
alter table leads add column if not exists priority text not null default 'medium'
  check (priority in ('low','medium','high'));
alter table leads add column if not exists estimated_value numeric(14,2);
alter table leads add column if not exists next_follow_up_date date;
alter table leads add column if not exists last_interaction_date timestamptz;
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists tags text[] not null default '{}';
alter table leads add column if not exists source text not null default 'website';
alter table leads add column if not exists deleted_at timestamptz;
alter table leads add column if not exists lead_number text;
alter table leads add column if not exists converted_to_client_id bigint;

-- Best-effort backfill of sales_stage from the old 4-value status, for rows
-- still sitting at the column default (i.e. not yet migrated). "closed" is
-- ambiguous (could be won or lost) and defaults to won — correct manually via
-- bulk edit if wrong for a given historical record.
update leads set sales_stage = case status
  when 'new' then 'new'
  when 'in_review' then 'contacted'
  when 'contacted' then 'contacted'
  when 'closed' then 'won'
  else 'new'
end
where sales_stage = 'new';

-- lead_number: sequence + trigger, format L-000123.
create sequence if not exists leads_lead_number_seq;

create or replace function public.assign_lead_number()
returns trigger
language plpgsql
as $$
begin
  if new.lead_number is null then
    new.lead_number := 'L-' || lpad(nextval('leads_lead_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_lead_number on leads;
create trigger trg_assign_lead_number
  before insert on leads
  for each row execute function public.assign_lead_number();

-- Backfill lead_number for existing rows, oldest first.
do $$
declare
  r record;
begin
  for r in select id from leads where lead_number is null order by created_at loop
    update leads set lead_number = 'L-' || lpad(nextval('leads_lead_number_seq')::text, 6, '0') where id = r.id;
  end loop;
end $$;

create unique index if not exists idx_leads_lead_number_unique on leads (lead_number);
create index if not exists idx_leads_sales_stage on leads (sales_stage) where deleted_at is null;
create index if not exists idx_leads_next_follow_up on leads (next_follow_up_date) where deleted_at is null;
create index if not exists idx_leads_deleted_at on leads (deleted_at);

-- ============================================================
-- lead_activities — full chronological timeline. Supersedes the old
-- leads.activity jsonb column going forward; historical jsonb entries stay
-- visible in the UI as a read-only fallback under the new timeline.
-- ============================================================
create table if not exists lead_activities (
  id bigserial primary key,
  lead_id bigint not null references leads(id) on delete cascade,
  type text not null check (type in (
    'created','status_changed','stage_changed','assigned','note','call','email','meeting',
    'follow_up_scheduled','attachment_uploaded','proposal_created','proposal_sent',
    'converted','won','lost'
  )),
  title text not null,
  description text,
  user_id uuid references profiles(id),
  related_object jsonb,
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead on lead_activities (lead_id, created_at desc);

alter table lead_activities enable row level security;

drop policy if exists "lead_activities_staff_read" on lead_activities;
create policy "lead_activities_staff_read" on lead_activities
  for select to authenticated using (true);

drop policy if exists "lead_activities_staff_insert" on lead_activities;
create policy "lead_activities_staff_insert" on lead_activities
  for insert to authenticated with check (true);

-- ============================================================
-- clients — created now so "convert lead to client" has somewhere to write.
-- The full Clients module UI (list/detail pages) ships in Phase 2; until
-- then this table is only reachable via the conversion action on a lead.
-- ============================================================
create table if not exists clients (
  id bigserial primary key,
  name text not null,
  logo_url text,
  industry text,
  company_size text,
  website text,
  country text,
  city text,
  account_owner uuid references profiles(id),
  notes text,
  tags text[] not null default '{}',
  status text not null default 'prospect' check (status in ('prospect','active','inactive','former_client')),
  source_lead_id bigint references leads(id),
  main_contact_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists client_contacts (
  id bigserial primary key,
  client_id bigint not null references clients(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Circular FK (clients.main_contact_id <-> client_contacts.client_id) added
-- after both tables exist. Postgres has no "add constraint if not exists",
-- so guard via information_schema.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints where constraint_name = 'clients_main_contact_fk'
  ) then
    alter table clients add constraint clients_main_contact_fk
      foreign key (main_contact_id) references client_contacts(id) on delete set null;
  end if;
  if not exists (
    select 1 from information_schema.table_constraints where constraint_name = 'leads_converted_client_fk'
  ) then
    alter table leads add constraint leads_converted_client_fk
      foreign key (converted_to_client_id) references clients(id) on delete set null;
  end if;
end $$;

create index if not exists idx_clients_status on clients (status) where deleted_at is null;
-- DB-level dedupe guard: a lead can only ever produce one client record, even
-- under a race (double-click, two staff converting at once).
create unique index if not exists idx_clients_source_lead_unique on clients (source_lead_id) where source_lead_id is not null;
create index if not exists idx_client_contacts_client on client_contacts (client_id);

alter table clients enable row level security;
alter table client_contacts enable row level security;

drop policy if exists "clients_staff_all" on clients;
create policy "clients_staff_all" on clients
  for all to authenticated using (true) with check (true);

drop policy if exists "client_contacts_staff_all" on client_contacts;
create policy "client_contacts_staff_all" on client_contacts
  for all to authenticated using (true) with check (true);
