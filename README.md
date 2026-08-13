# Jadara Al-Ada'a — Website & Admin Panel

Static site + admin panel for Jadara Al-Ada'a Consulting, backed by [Supabase](https://supabase.com) (Postgres + Auth). No build step — plain HTML/CSS/JS served directly.

## Structure

- `index.html`, `css/style.css`, `js/main.js` — public landing page (Arabic/RTL). Reads `services`, `site_stats`, and `client_logos` from Supabase at load, falling back to built-in defaults if Supabase is unreachable. The contact form writes directly to the `leads` table.
- `admin/` — internal admin panel (login via Supabase Auth). Being expanded from a leads inbox + CMS into a full consulting CRM and "Consulting Studio" deliverable builder — see `docs/consulting-platform-plan.md` for the roadmap and current phase status.
  - `admin/js/main.js` — entry point, loaded as a native ES module (`<script type="module">`). No bundler — the browser resolves `import`s directly, so Amplify's zero-build deploy still works unchanged.
  - `admin/js/modules/` — one file per concern (`auth.js`, `nav.js`, `leads.js`, `content.js`, `dashboard.js`, `team.js`, `integrations.js`, etc.). `nav.js` owns page routing via a loader-registry (`registerPageLoader`) so domain modules never import each other circularly.
- `privacy-policy.html` — static privacy policy page.
- `supabase/` — SQL migrations for the Supabase schema (run manually in the Supabase SQL editor, in order). `001_content_and_leads.sql` is the original CMS schema; `002_profiles_roles_audit.sql` adds `profiles` (role-based access), `audit_logs`, and the `current_user_role()`/`is_admin()` RLS helpers used by later modules.
- `docs/consulting-platform-plan.md` — the implementation plan for the CRM + Consulting Studio build: architecture decisions, data model, and phase-by-phase status.

## Configuration

Supabase URL and anon key are embedded as `<meta>` tags in `index.html` and `admin/index.html`. The anon key is safe to expose client-side by design — access control is enforced by Postgres Row Level Security policies (see `supabase/`), not by hiding the key.

Secrets that are **not** safe to expose (e.g. the Anthropic API key used by Consulting Studio's AI insight generation, added in a later phase) are set directly in Supabase's own secret store (dashboard → Edge Functions → Secrets, or `supabase secrets set KEY=value`) and read only from server-side Edge Functions — never embedded in this repo or passed through the browser.

## Deployment

Hosted on AWS Amplify (two apps, both connected to this repo):

- Landing site — app root `/`, custom domain `jadara-aladaa.sa`
- Admin panel — app root `/admin`, custom domain `admin.jadara-aladaa.sa`

Both auto-deploy on push to `main`. No build command — Amplify publishes the app root directory as-is.
