/* Weekly feature-reveal schedule for CEO demos. Purely a nav-level display
   gate — RLS access, data, and internal app navigation (e.g. "convert lead
   to client") are completely unaffected, so nothing breaks or loses data
   when a tab is revealed later. To unlock the next item, flip its
   `revealed` flag to true and push.

   `week` here is our own internal build/demo cadence (unrelated to the
   CEO's 4 official business phases, which are shown as static subtitle
   labels directly in admin/index.html instead — see docs/consulting-
   platform-plan.md §9). Only CRM/Studio capability pages built during
   this project are gated. Dashboard, site content, team/permissions,
   integrations, reports, and settings predate or scaffold this build
   rather than being a "reveal" moment themselves, so they stay visible
   throughout. */
export const REVEAL_SCHEDULE = [
  { tab: 'listPage', week: 1, revealed: true },
  { tab: 'clientsPage', week: 2, revealed: false },
  { tab: 'projectsPage', week: 2, revealed: false },
  { tab: 'proposalsPage', week: 3, revealed: false },
  { tab: 'studioPage', week: 4, revealed: false },
  // Not built yet — no page/loader exists for this tab. Stays locked until
  // an actual accounting module ships; safe to leave permanently false.
  { tab: 'accountingPage', week: null, revealed: false }
];

const scheduleByTab = Object.fromEntries(REVEAL_SCHEDULE.map(r => [r.tab, r]));

export function isTabRevealed(tabId) {
  const entry = scheduleByTab[tabId];
  return entry ? entry.revealed : true;
}

// Sub-feature gate: the AI "Automate" button lives inside the Studio page
// (studioPage), but is its own later reveal step rather than a separate
// sidebar tab.
export const AI_INSIGHTS_REVEALED = false;
