import { $, $$ } from './dom.js';
import { state } from './state.js';
import { canSeeTab } from './permissions.js';
import { isTabRevealed } from './feature-reveal.js';

export const pageTitles = {
  dashboardPage: 'لوحة المعلومات',
  listPage: 'العملاء المحتملون',
  detailPage: 'تفاصيل العميل المحتمل',
  clientsPage: 'العملاء',
  clientDetailPage: 'تفاصيل العميل',
  projectsPage: 'المشاريع',
  projectDetailPage: 'تفاصيل المشروع',
  proposalsPage: 'العروض',
  proposalDetailPage: 'تفاصيل العرض',
  studioPage: 'استوديو الاستشارات',
  studioWizardPage: 'تقرير جديد',
  studioEditorPage: 'تحرير التقرير',
  contentPage: 'محتوى الموقع',
  reportsPage: 'التقارير',
  teamPage: 'الفريق والصلاحيات',
  integrationsPage: 'التكاملات',
  settingsPage: 'الإعدادات',
  accountingPage: 'نظام محاسبة'
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

// Locked tabs stay visible (not hidden) so the sidebar structure reads as
// "more is coming," but are greyed out with a "قريباً" badge and don't
// navigate on click.
export function applyFeatureReveal() {
  $$('.sidebar__link').forEach(link => {
    const tab = link.dataset.tab;
    const revealed = isTabRevealed(tab);
    link.classList.toggle('sidebar__link--locked', !revealed);
    const existingBadge = link.querySelector('.sidebar__lock-badge');
    if (!revealed) {
      if (!existingBadge) link.insertAdjacentHTML('beforeend', `<span class="sidebar__lock-badge">قريباً</span>`);
    } else if (existingBadge) {
      existingBadge.remove();
    }
  });
}

export function bindNavEvents() {
  $$('.sidebar__link').forEach(link => {
    link.addEventListener('click', () => {
      if (!isTabRevealed(link.dataset.tab)) return;
      showPage(link.dataset.tab);
    });
  });
  $('#menuToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
}
