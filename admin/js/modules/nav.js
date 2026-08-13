import { $, $$ } from './dom.js';
import { state } from './state.js';
import { canSeeTab } from './permissions.js';

export const pageTitles = {
  dashboardPage: 'لوحة المعلومات',
  listPage: 'العملاء المحتملون',
  detailPage: 'تفاصيل العميل المحتمل',
  clientsPage: 'العملاء',
  projectsPage: 'المشاريع',
  proposalsPage: 'العروض',
  studioPage: 'استوديو الاستشارات',
  contentPage: 'محتوى الموقع',
  reportsPage: 'التقارير',
  teamPage: 'الفريق والصلاحيات',
  integrationsPage: 'التكاملات',
  settingsPage: 'الإعدادات'
};

// Domain modules register a loader for their page id instead of nav.js
// importing them directly — keeps this module dependency-free and avoids
// circular imports (leads.js/dashboard.js/etc. import showPage from here).
const pageLoaders = {};
export function registerPageLoader(id, fn) {
  pageLoaders[id] = fn;
}

export function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view--active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('view--active');
}

export function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('page--active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('page--active');

  $$('.sidebar__link').forEach(l => l.classList.toggle('is-active', l.dataset.tab === id));
  const title = $('#topbarTitle');
  if (title && pageTitles[id]) title.textContent = pageTitles[id];

  document.body.classList.remove('sidebar-open');

  const loader = pageLoaders[id];
  if (loader) loader();
}

export function applyRoleVisibility() {
  const role = state.currentProfile?.role;
  $$('.sidebar__link').forEach(link => {
    const visible = canSeeTab(link.dataset.tab, role);
    link.style.display = visible ? '' : 'none';
  });
}

export function bindNavEvents() {
  $$('.sidebar__link').forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.tab));
  });
  $('#menuToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
}
