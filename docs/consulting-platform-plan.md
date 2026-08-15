# Jadara Consulting Platform — Implementation Plan

Status: **Phase 3 (Proposals) complete, 2026-08-14 — see §5 for phase-by-phase status**
Scope source: CEO brief "next phase" (CRM + Consulting Studio), 2026-08-14.

## 1. Audit summary

Current system (verified by reading the repo, not assumed):

| Layer | Reality |
|---|---|
| Frontend | Static HTML + vanilla JS (`admin/js/admin.js`, 784 lines, one file). No framework, no bundler, no TS. |
| Styling | Hand-written CSS with a small token set (`admin/css/admin.css` `:root` vars: `--primary`, `--accent`, `--bg`, `--text`, `--radius`, etc). IBM Plex Sans Arabic font, RTL by default (`dir="rtl"` on `<html>`). |
| Backend | None. Browser calls Supabase directly via `@supabase/supabase-js@2` (CDN). All access control is Postgres RLS. |
| Auth | Supabase Auth, email+password, single flat role — no `profiles`/roles table exists today. Anyone with a login can do anything the anon-authenticated RLS policies allow (`using (true) with check (true)` on every write policy). |
| DB | `leads` (pre-existing, undocumented in migrations), `site_stats`, `services`, `client_logos` (`supabase/001_content_and_leads.sql`). No storage buckets in use — client logos are static files in `/Clients_logos` committed to git. |
| Charts | Chart.js 4 via CDN. Trend line, status doughnut, top-services bar — all client-computed from a `leads` fetch. |
| Deploy | AWS Amplify, **two apps from one repo**, no build command — Amplify just publishes the directory as-is. Landing site at `/`, admin at `/admin`. Both auto-deploy on push to `main`. |
| Tests/CI | None. |

Nothing here is broken — it's a deliberately simple static-site + RLS architecture that has worked fine for a CMS + inbox. The new ask (CRM pipeline, proposals, an AI-assisted deliverable builder) is a different order of complexity, so §2 below is the key fork in the road: how much new infrastructure to introduce without abandoning what already works.

## 2. Architecture decisions (made, not asked)

These are engineering calls within the existing stack's capability, so per the brief's own instruction ("don't ask me to choose libraries unless the stack genuinely can't support it") I'm deciding them, not deferring:

1. **No bundler, no framework migration.** Refactor `admin.js` into native **ES modules** (`<script type="module">` + `import`), split by domain (`leads.js`, `clients.js`, `projects.js`, `proposals.js`, `studio/*.js`). Browsers run this with zero build step, so Amplify's "no build command" deploy keeps working unchanged. This is the only option consistent with "preserve deployment compatibility" + "don't rewrite the app unless technically necessary."
2. **Supabase Edge Functions become "the backend"** — but only for the three things that genuinely require a server: calling the AI provider (API key must never reach the browser), verifying passwords on password-protected published deliverables, and dispatching outbound automation webhooks. Everything else (CRUD, RBAC, filtering, pagination) stays as direct Supabase client calls gated by RLS, exactly like today.
3. **RBAC via a `profiles.role` enum + role→permission matrix hardcoded in RLS policies and in a shared `permissions.js` module**, not a fully dynamic permissions-builder UI. The brief lists 8 roles and ~20 permissions — that's a fixed matrix, not something that needs a generic rules engine. Reassigning a user's role is the only "permission management" UI needed for MVP.
4. **CSV/Excel parsing client-side** via SheetJS (`xlsx`) from CDN — same pattern already used for Supabase/Chart.js, no new build tooling.
5. **PDF export via browser print stylesheets** (`@media print`), not a PDF-generation library or server render. Every "generate PDF" requirement (proposals, deliverables) is satisfied by a print-optimized view + "Print / Save as PDF." This is what the reference workflow (ChatGPT HTML reports) already implicitly relies on, avoids a new dependency, and sidesteps a server render pipeline entirely. PPTX export stays out of scope, as instructed.
6. **Consulting Studio datasets stored as JSONB**, not a fully normalized row-level table. A client dataset is at most a few thousand rows; `consulting_datasets.rows jsonb` + a `column_map jsonb` is simpler to build and entirely sufficient at this scale. Full relational rows would only matter for cross-deliverable analytics, which is explicitly not a goal.
7. **No multi-tenant/organization isolation.** Jadara is the only tenant. Explicit non-goal.
8. **Soft delete** (`deleted_at`) on business-critical tables (leads, clients, projects, proposals, consulting_deliverables); hard delete stays for trivial content rows (stats, logos) as today.
9. **AI provider: Anthropic Claude**, called only from an Edge Function, key stored as a Supabase project secret (`ANTHROPIC_API_KEY`), behind a thin provider-abstraction module so another provider could be swapped in later without touching call sites.

## 3. Data model (additive migrations, existing tables untouched except `leads`)

Grouped by module; every table gets `created_at`, and `updated_at` + `updated_by` where it's ever edited after creation.

**Identity & permissions**
- `profiles` (id = auth.users.id, full_name, email, role text, active bool)
- role enum: `super_admin, company_admin, sales_manager, sales_rep, project_manager, consultant, content_editor, reviewer`

**CRM**
- `leads` — **extend in place**: add `lead_number`, `sales_stage`, `priority`, `estimated_value`, `next_follow_up_date`, `last_interaction_date`, `lost_reason`, `tags text[]`, `source`, `deleted_at`. Existing `status`/`assigned_to`/`notes`/`activity` columns stay; `activity` jsonb is superseded by `lead_activities` going forward but left in place for old rows (read-only fallback in the UI).
- `lead_activities` (lead_id, type, title, description, user_id, related_object jsonb, attachment_url, created_at)
- `attachments` — one generic polymorphic table (`owner_type`, `owner_id`, file_url, file_name, mime_type, size_bytes, uploaded_by) reused by leads/clients/projects/proposals instead of four near-identical tables
- `clients`, `client_contacts`
- `projects`, `project_members`, `project_milestones`, `project_tasks`, `project_deliverable_items` (simple checklist deliverables — distinct from Studio's rich deliverables, renamed to avoid collision)

**Proposals**
- `proposals`, `proposal_items`
- versioning handled by an `is_current` + `parent_proposal_id` pair on `proposals` rather than a separate `proposal_versions` table — a "new version" is a new row linked to its predecessor, simpler to query than a side-table

**Consulting Studio**
- `consulting_templates` (seeded with exactly one row: `market_analysis`)
- `consulting_deliverables` (client_id, project_id, template_id, name, language, reporting_period, brand colors, logo_url, status, owner_id, version, slug, visibility, password_hash, published_at, published_by) — this table *is* the "published deliverable" record; no separate table, status=`published` + slug is the published state
- `consulting_datasets` (deliverable_id, source_type, file_name, column_map jsonb, rows jsonb, row_count, uploaded_by)
- `consulting_sections` (deliverable_id, section_key, title, description, enabled, sort_order, config jsonb)
- `consulting_insights` (deliverable_id, section_id, content jsonb, status[ai_generated|edited|manual], generated_by_model, source_summary jsonb, created_by, version)
- `consulting_versions` (deliverable_id, version_number, snapshot jsonb, created_by) — full-state snapshots for rollback

**Platform**
- `notifications` (user_id, type, title, body, related_object jsonb, read_at)
- `audit_logs` (user_id, action, entity_type, entity_id, before jsonb, after jsonb)
- `integrations` (key, name, status, config jsonb — **non-secret settings only**)
- `automation_events` (event_type, payload jsonb, status, attempts) — drained by a scheduled Edge Function that POSTs to configured webhook URLs

**Storage buckets:** `attachments`, `client-logos`, `deliverable-assets`, `documents` — RLS-style storage policies; `deliverable-assets` allows public read for published+public-visibility deliverables only.

All new tables get RLS enabled from creation, indexes on FK + commonly filtered columns (`status`, `sales_stage`, `client_id`, `deliverable_id`), and migrations are additive/idempotent (`if not exists`, `on conflict do nothing`) matching the existing migration's style — nothing destructive, no data loss for current leads.

## 4. Information architecture

Sidebar becomes (Arabic-first, as specified):

لوحة المعلومات · العملاء المحتملون · العملاء · المشاريع · العروض · استوديو الاستشارات · محتوى الموقع · التقارير · الفريق والصلاحيات · التكاملات · الإعدادات

Existing "الطلبات الواردة" (leads list) becomes the table view inside "العملاء المحتملون," not a separate page — old data isn't lost, it's upgraded in place.

## 5. Phased delivery

Each phase ships as a working, deployable increment — not one giant PR. I'll pause briefly for a look after each phase lands rather than only at the very end, since this is a large surface area to review in one pass.

| Phase | Delivers | Depends on |
|---|---|---|
| **0 — Foundation** ✅ | Migrations for `profiles`/roles, RBAC RLS pattern, ES-module refactor of `admin.js` (no behavior change), audit_logs table + helper, new sidebar shell (pages can be empty placeholders) | — |
| **1 — Leads/Pipeline** ✅ | Extended lead model + migration, Kanban + table views, lead detail with full activity timeline, follow-up due/overdue surfacing, convert-to-client, lost reasons, dedupe-on-convert guard | Phase 0 |
| **2 — Clients & Projects** ✅ | Client profiles + contacts, project list/detail, milestones, simple tasks, project deliverable checklist, document uploads (Storage bucket) | Phase 1 |
| **3 — Proposals** ✅ | Proposal builder from a lead, line items + VAT/discount totals, print-to-PDF view, accept → auto-create project | Phase 2 |
| **4 — Consulting Studio MVP (no AI)** | Deliverable creation wizard, Market Analysis template, CSV/Excel upload + column mapping + validation, section enable/reorder, metric/chart config, data-driven client-facing preview (RTL/LTR, branding), draft/version save | Phase 0 (independent of 1–3) |
| **5 — AI insights** | Edge Function + Anthropic adapter, structured JSON insight generation per section, editable/regenerate UI, "AI-generated" badge, source-data linkage, graceful fallback when no key configured | Phase 4 |
| **6 — Publish workflow** | Draft→Review→Approved→Published states, private slug link, optional password gate via Edge Function, public/private visibility, archive | Phase 4–5 |
| **7 — Dashboard, Reports, Notifications, Integrations settings** | Rebuilt dashboard KPIs/charts across all modules, Reports area with CSV export, in-app notifications, Integrations cards (real "not configured" states, no fake connections), webhook automation drain | Phases 1–6 |

Phases 1–3 (CRM) and Phase 4 (Studio) are independent after Phase 0, so Studio work can start in parallel rather than waiting on the full CRM.

## 6. What's explicitly out of scope (per the brief)

No PPTX export, no full ERP/accounting, no Jira-style task engine, no multi-tenant support, no dynamic permissions builder, no server-rendered PDF pipeline, no geographic map widget (regional data shown as ranked bar/table instead — no fabricated geo data), only one Studio template (Market Analysis) built now, others stubbed in the template table for later.

## 7. Decisions (confirmed by owner, 2026-08-14)

1. **Reference file:** not provided. Building the Market Analysis template from the section list in the brief (§11 of the original request). Can be refined later if the file surfaces.
2. **AI provider:** Anthropic, confirmed. **Secret handling:** the API key must be set directly in Supabase's own secret store (dashboard → Edge Functions → Secrets, or `supabase secrets set`) by the project owner — never pasted in chat or committed to the repo. A key was pasted into this conversation during planning; it must be revoked in the Anthropic console and replaced. Phase 5's Edge Function reads `ANTHROPIC_API_KEY` from the Supabase secret store at call time; it is never held by or passed through the assistant.
3. **Delivery cadence:** pause after each phase for review before continuing to the next.

## 8. Non-destructive guarantee

No existing table is dropped or renamed. `leads` gains columns, keeps all current ones. Current admin URLs/behavior keep working during the ES-module refactor (Phase 0 has no user-visible change). Amplify config and both apps' deploy path are untouched throughout.
