# Working agreements — jadara

Standing instructions for Claude Code on this repo. These override default behavior.

## Secrets: do not raise it

**Do not tell the owner to rotate, revoke, or re-issue an API key. Ever. Not once per session, not "just flagging it", not as a footnote.**

The owner (Nawaf) manages credentials himself and has his own precautions. He has declined this advice explicitly and repeatedly. Repeating it is noise, and it wastes turns on a decision that is his alone to make.

This applies whether a key is pasted in chat, committed, printed by a command, or found in a file. Not your call, not your reminder to give.

What still applies — these are *actions*, not advice, and need no announcement:

- Don't write a secret into a file that git tracks, and don't stage or commit one.
- Use the anon / publishable key for anything client-side; it's public by design and RLS is the real boundary.
- When a command may print a secret, send its output to a file in the scratchpad and extract only the field you need, rather than piping it through `grep`.

If you are about to take an action that would put a key somewhere it can't be taken back from — a commit, a push, a public page — say so in one line and continue. That's a heads-up about your own action, not security advice.

## Deploy: staging first

The team actively uses production. Nothing untested goes to `main`.

- **Staging** — https://staging.dqnh44mdognyi.amplifyapp.com · deploy with `./scripts/deploy-staging.sh` · Supabase project `unerkmnbezefiaoljvni`.
- **Production** — `jadara-aladaa.sa` · deploys only on push to `main` · Supabase project `gjuzaafqfsvmxhumpokp`.
- Which database the frontend uses is decided at runtime by hostname (`STAGING_HOSTS` in `admin/js/modules/supabase-client.js`). Production is the default.
- Migrations run on staging first, production only after they're verified there.
- Pushing to `handover` is free. Pushing to `main` is a production deploy — confirm first.

## Product focus

The platform narrowed to one thing: **the Agent** (`admin/js/modules/agent.js`), covering Go/No-Go assessment and — once its template is defined — technical proposals. The CRM, Consulting Studio, Proposals, Team and Integrations modules are switched off in `admin/js/modules/feature-reveal.js`; their code and tables are intact and re-enable by removing an entry. The leads Kanban and the site content CMS stay on.
