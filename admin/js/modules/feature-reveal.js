/* Which admin modules are switched on.

   The platform narrowed to a single focus: Technical Proposal automation
   (the Agent), plus the leads pipeline that feeds it. Everything else is
   hidden rather than deleted — the modules, their code and their Postgres
   tables are all still intact, so any of them can be switched back on by
   removing its entry below. Nothing here is a security boundary; RLS is
   still the only real access control. */
export const HIDDEN_TABS = new Set([
  'clientsPage',
  'projectsPage',
  'proposalsPage',
  'studioPage',
  'teamPage',
  'integrationsPage',
  'reportsPage',
  'accountingPage'
]);

export function isTabHidden(tabId) {
  return HIDDEN_TABS.has(tabId);
}

/* The Consulting Studio's AI "Automate" button. The Studio itself is hidden
   above, so this only matters if that module is switched back on — and it
   additionally needs migration 007 applied and the generate-insight Edge
   Function deployed, so it stays off rather than claiming to work. */
export const AI_INSIGHTS_REVEALED = false;
