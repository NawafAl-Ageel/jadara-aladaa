# Jadara Al-Ada'a — Website & Admin Panel

Static site + admin panel for Jadara Al-Ada'a Consulting, backed by [Supabase](https://supabase.com) (Postgres + Auth). No build step — plain HTML/CSS/JS served directly.

## Structure

- `index.html`, `css/style.css`, `js/main.js` — public landing page (Arabic/RTL). Reads `services`, `site_stats`, and `client_logos` from Supabase at load, falling back to built-in defaults if Supabase is unreachable. The contact form writes directly to the `leads` table.
- `admin/` — internal admin panel (login via Supabase Auth). Manages leads, site content (services/stats/logos), and shows a dashboard.
- `privacy-policy.html` — static privacy policy page.
- `supabase/` — SQL migrations for the Supabase schema (run manually in the Supabase SQL editor).

## Configuration

Supabase URL and anon key are embedded as `<meta>` tags in `index.html` and `admin/index.html`. The anon key is safe to expose client-side by design — access control is enforced by Postgres Row Level Security policies (see `supabase/`), not by hiding the key.

## Deployment

Hosted on AWS Amplify (two apps, both connected to this repo):

- Landing site — app root `/`, custom domain `jadara-aladaa.sa`
- Admin panel — app root `/admin`, custom domain `admin.jadara-aladaa.sa`

Both auto-deploy on push to `main`. No build command — Amplify publishes the app root directory as-is.
