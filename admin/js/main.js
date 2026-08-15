/* ============================================
   JADARA ADMIN — entry point.
   Native ES modules, no bundler (Amplify deploys this directory as-is).
   ============================================ */

import { $, $$ } from './modules/dom.js';
import { initSupabase } from './modules/supabase-client.js';
import { registerPageLoader, bindNavEvents, showPage } from './modules/nav.js';
import { checkAuth, handleLogin, handleLogout } from './modules/auth.js';
import { loadDashboard } from './modules/dashboard.js';
import { loadLeadsPage, bindLeadsEvents } from './modules/leads.js';
import { loadClients, bindClientsEvents } from './modules/clients.js';
import { loadProjects, bindProjectsEvents } from './modules/projects.js';
import { loadProposals, bindProposalsEvents } from './modules/proposals.js';
import { bindPrintOverlay } from './modules/proposal-print.js';
import { loadContent, openLogoModal } from './modules/content.js';
import { loadTeam } from './modules/team.js';
import { loadIntegrations } from './modules/integrations.js';
import { bindModalOverlayClose } from './modules/modal.js';

registerPageLoader('dashboardPage', loadDashboard);
registerPageLoader('listPage', loadLeadsPage);
registerPageLoader('clientsPage', loadClients);
registerPageLoader('projectsPage', loadProjects);
registerPageLoader('proposalsPage', loadProposals);
registerPageLoader('contentPage', loadContent);
registerPageLoader('teamPage', loadTeam);
registerPageLoader('integrationsPage', loadIntegrations);

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  checkAuth();
  bindEvents();
});

function bindEvents() {
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutBtn').addEventListener('click', handleLogout);
  $('#backBtn').addEventListener('click', () => showPage('listPage'));

  bindLeadsEvents();
  bindClientsEvents();
  bindProjectsEvents();
  bindProposalsEvents();
  bindPrintOverlay();
  bindNavEvents();

  $$('.content-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.content-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      $$('.content-panel').forEach(p => p.classList.remove('content-panel--active'));
      $(`#${tab.dataset.contentTab}`).classList.add('content-panel--active');
    });
  });

  $('#addLogoBtn')?.addEventListener('click', () => openLogoModal());
  bindModalOverlayClose();
}
