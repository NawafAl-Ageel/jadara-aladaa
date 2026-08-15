/* Weekly feature-reveal schedule for CEO demos. Purely a nav-level display
   gate — RLS access, data, and internal app navigation (e.g. "convert lead
   to client") are completely unaffected, so nothing breaks or loses data
   when a tab is revealed later. To unlock the next item, flip its
   `revealed` flag to true and push.

   Only CRM/Studio capability pages built during this project are gated.
   Dashboard, site content, team/permissions, integrations, reports, and
   settings predate or scaffold this build rather than being a "reveal"
   moment themselves, so they stay visible throughout. */
export const REVEAL_SCHEDULE = [
  { tab: 'listPage', phase: 1, revealed: true },
  { tab: 'clientsPage', phase: 2, revealed: false },
  { tab: 'projectsPage', phase: 2, revealed: false },
  { tab: 'proposalsPage', phase: 3, revealed: false },
  { tab: 'studioPage', phase: 4, revealed: false }
];

const scheduleByTab = Object.fromEntries(REVEAL_SCHEDULE.map(r => [r.tab, r]));

export function isTabRevealed(tabId) {
  const entry = scheduleByTab[tabId];
  return entry ? entry.revealed : true;
}

export function tabPhase(tabId) {
  return scheduleByTab[tabId]?.phase ?? null;
}

// Sub-feature gate: the AI "Automate" button lives inside the Studio page
// (studioPage, phase 4), but is its own later reveal step (phase 5) rather
// than a separate sidebar tab.
export const AI_INSIGHTS_REVEALED = false;
export const AI_INSIGHTS_PHASE = 5;
