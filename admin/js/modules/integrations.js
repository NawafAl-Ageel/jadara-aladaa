import { $, esc } from './dom.js';

/* Honest placeholder state — nothing here is actually connected yet.
   Real setup (API credentials, OAuth, webhook URLs) happens outside the
   admin UI first; this page only ever reflects true status, never a fake
   "connected" state. See docs/consulting-platform-plan.md §17/§7. */
const INTEGRATIONS = [
  { name: 'إشعارات البريد الإلكتروني', desc: 'إرسال إشعارات داخلية عند وصول عميل محتمل جديد أو اقتراب موعد متابعة.', status: 'not_configured' },
  { name: 'تذكيرات التقويم (Google Calendar)', desc: 'جدولة متابعات العملاء المحتملين مباشرة في تقويم الموظف المسؤول.', status: 'not_configured' },
  { name: 'استيراد بيانات (Google Sheets)', desc: 'استيراد بيانات جاهزة إلى استوديو الاستشارات مباشرة من جداول جوجل.', status: 'coming_later' },
  { name: 'تخزين المستندات (Google Drive)', desc: 'حفظ مرفقات العملاء والمشاريع في مساحة تخزين مشتركة.', status: 'coming_later' },
  { name: 'ويب هوك للأتمتة (n8n / Make)', desc: 'إرسال أحداث النظام (عميل جديد، عرض مقبول، تقرير منشور) إلى أدوات الأتمتة الخارجية.', status: 'not_configured' },
  { name: 'حزمة Google Workspace', desc: 'دخول موحد (SSO) وإدارة بريد الموظفين — تصبح متاحة عند اشتراك الشركة في Google Workspace.', status: 'coming_later' },
  { name: 'واتساب للأعمال', desc: 'إشعارات وتواصل مع العملاء المحتملين عبر واتساب.', status: 'coming_later' },
  { name: 'التوقيع الإلكتروني', desc: 'توقيع العروض والعقود إلكترونياً.', status: 'coming_later' }
];

const STATUS_META = {
  not_configured: { label: 'غير مُعد', cls: 'is-not-configured' },
  connected: { label: 'متصل', cls: 'is-connected' },
  error: { label: 'خطأ', cls: 'is-error' },
  disabled: { label: 'معطّل', cls: 'is-disabled' },
  coming_later: { label: 'قادم لاحقاً', cls: 'is-coming-later' }
};

export function loadIntegrations() {
  const grid = $('#integrationsGrid');
  grid.innerHTML = INTEGRATIONS.map(i => {
    const meta = STATUS_META[i.status];
    return `
      <div class="integration-card">
        <div class="integration-card__header">
          <h3>${esc(i.name)}</h3>
          <span class="integration-status ${meta.cls}">${meta.label}</span>
        </div>
        <p class="content-hint">${esc(i.desc)}</p>
      </div>
    `;
  }).join('');
}
