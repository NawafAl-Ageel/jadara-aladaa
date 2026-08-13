-- Jadara Consulting Platform — Phase 0: identity, roles, audit log.
-- Run this in the Supabase SQL editor for project gjuzaafqfsvmxhumpokp, after 001_content_and_leads.sql.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT / OR REPLACE throughout.
-- Does not touch existing leads/site_stats/services/client_logos policies — those are
-- upgraded per-module in later phases, not here.

-- ============================================================
-- profiles — one row per admin user, holds the RBAC role.
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'consultant' check (role in (
    'super_admin', 'company_admin', 'sales_manager', 'sales_rep',
    'project_manager', 'consultant', 'content_editor', 'reviewer'
  )),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill: anyone who already has a login today keeps full access (super_admin),
-- since that matches what the old "authenticated == full access" policies gave them.
insert into profiles (id, email, full_name, role, active)
select u.id, u.email, u.email, 'super_admin', true
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict (id) do nothing;

-- New Supabase Auth signups get a profile row automatically (default role: consultant,
-- an admin then promotes them from Team & Permissions).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'consultant', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- security definer helper so RLS policies (including on profiles itself) can check
-- the caller's role without recursive-RLS issues.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'company_admin'), false)
$$;

-- Prevent a non-admin from editing their own role/active flag via a plain UPDATE.
create or replace function public.profiles_guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.is_admin() then
    new.role := old.role;
    new.active := old.active;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard
  before update on profiles
  for each row execute function public.profiles_guard_role_change();

alter table profiles enable row level security;

drop policy if exists "profiles_read_all_staff" on profiles;
create policy "profiles_read_all_staff" on profiles
  for select to authenticated using (true);

drop policy if exists "profiles_self_or_admin_update" on profiles;
create policy "profiles_self_or_admin_update" on profiles
  for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_admin_insert" on profiles;
create policy "profiles_admin_insert" on profiles
  for insert to authenticated
  with check (public.is_admin());

-- ============================================================
-- audit_logs — append-only record of sensitive actions.
-- ============================================================
create table if not exists audit_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at desc);

alter table audit_logs enable row level security;

drop policy if exists "audit_logs_admin_read" on audit_logs;
create policy "audit_logs_admin_read" on audit_logs
  for select to authenticated using (public.is_admin());

drop policy if exists "audit_logs_self_insert" on audit_logs;
create policy "audit_logs_self_insert" on audit_logs
  for insert to authenticated with check (auth.uid() = user_id);
