-- Jadara Consulting Platform — Phase 3: proposals.
-- Run in the Supabase SQL editor for project gjuzaafqfsvmxhumpokp, after 004_clients_projects.sql.
-- Safe to re-run. Additive only.

-- ============================================================
-- proposals — a proposal always targets a lead and/or an existing client.
-- All monetary totals are computed app-side on save and stored (not
-- recomputed via generated columns) so historical proposals keep their
-- exact totals even if VAT rate defaults change later.
-- ============================================================
create sequence if not exists proposals_proposal_number_seq;

create table if not exists proposals (
  id bigserial primary key,
  proposal_number text,
  lead_id bigint references leads(id),
  client_id bigint references clients(id),
  project_title text not null,
  scope text,
  deliverables text,
  timeline text,
  subtotal numeric(14,2) not null default 0,
  discount_type text not null default 'fixed' check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  vat_rate numeric(5,2) not null default 15.00,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  terms text,
  internal_notes text,
  version int not null default 1,
  is_current boolean not null default true,
  parent_proposal_id bigint references proposals(id),
  status text not null default 'draft' check (status in (
    'draft', 'internal_review', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  )),
  created_by uuid references profiles(id),
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at date,
  project_id bigint references projects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_target_check check (lead_id is not null or client_id is not null)
);

create or replace function public.assign_proposal_number()
returns trigger
language plpgsql
as $$
begin
  if new.proposal_number is null then
    new.proposal_number := 'PR-' || lpad(nextval('proposals_proposal_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_proposal_number on proposals;
create trigger trg_assign_proposal_number
  before insert on proposals
  for each row execute function public.assign_proposal_number();

create unique index if not exists idx_proposals_number_unique on proposals (proposal_number);
create index if not exists idx_proposals_lead on proposals (lead_id);
create index if not exists idx_proposals_client on proposals (client_id);
create index if not exists idx_proposals_status on proposals (status);

alter table proposals enable row level security;

drop policy if exists "proposals_staff_all" on proposals;
create policy "proposals_staff_all" on proposals
  for all to authenticated using (true) with check (true);

-- ============================================================
-- proposal_items — line items. line_total is computed app-side
-- (quantity * unit_price) and stored, same rationale as proposals' totals.
-- ============================================================
create table if not exists proposal_items (
  id bigserial primary key,
  proposal_id bigint not null references proposals(id) on delete cascade,
  service_key text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  sort_order int not null default 0
);

create index if not exists idx_proposal_items_proposal on proposal_items (proposal_id, sort_order);

alter table proposal_items enable row level security;

drop policy if exists "proposal_items_staff_all" on proposal_items;
create policy "proposal_items_staff_all" on proposal_items
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Link projects back to the proposal that spawned them (accept -> project),
-- mirroring the projects.source_lead_id dedupe-guard pattern from Phase 2.
-- ============================================================
alter table projects add column if not exists source_proposal_id bigint references proposals(id);
create unique index if not exists idx_projects_source_proposal_unique on projects (source_proposal_id) where source_proposal_id is not null;
