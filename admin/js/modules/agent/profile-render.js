import { esc } from '../dom.js';

/* Renders a researched entity profile.

   Two halves, kept visually distinct because they have different standing:
   `facts` came from Exa's search and is shown as retrieved — including in its
   original language, since translating a tender title would lose the string
   you'd search Etimad for. `analysis` is Claude's read for Jadara, which is
   judgement, not record.

   Empty fields are dropped rather than rendered as rows of dashes: a profile
   of a small authority shouldn't look half-broken next to one of a ministry. */

const list = (items) => (items || []).filter(Boolean).map(i => `<li>${esc(i)}</li>`).join('');
const has = (v) => v !== null && v !== undefined && v !== '' && v !== '—' &&
  !(Array.isArray(v) && v.length === 0);

function facts(pairs) {
  const rows = pairs.filter(([, v]) => has(v));
  if (!rows.length) return '';
  return `<dl class="prof-facts">${rows.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function section(title, body, cls = '') {
  return body ? `<section class="gng-section ${cls}"><h2>${esc(title)}</h2>${body}</section>` : '';
}

function bullets(title, items) {
  return has(items) ? `<h3>${esc(title)}</h3><ul>${list(items)}</ul>` : '';
}

export function renderProfile(p) {
  if (!p) return '<div class="empty-state">لا يوجد ملف بعد.</div>';

  const f = p.facts || {};
  const a = p.analysis || {};

  return `
    <article class="gng-doc" dir="rtl">
      <header class="gng-cover">
        <p class="gng-cover__kicker">ملف تعريفي عن جهة</p>
        <h1 class="gng-cover__title">${esc(f.legal_name || p.entity_name || '—')}</h1>
        ${has(f.name_en) ? `<p class="prof-en" dir="ltr">${esc(f.name_en)}</p>` : ''}
        ${facts([
          ['النوع', f.entity_type],
          ['الجهة الأم', f.parent_entity],
          ['التأسيس', f.established],
          ['المقر', f.headquarters],
          ['الموقع', f.website],
        ])}
      </header>

      ${has(a.summary) ? section('الخلاصة', `<p>${esc(a.summary)}</p>`) : ''}

      ${section('قراءة استراتيجية لجَدارة', has(a.strategic_read)
        ? `<ul>${list(a.strategic_read)}</ul>` : '', 'gng-section--opinion')}

      ${section('مداخل استشارية', has(a.consulting_entry_points) ? `
        <table class="gng-table">
          <thead><tr><th>الحاجة</th><th>خدمة جَدارة</th><th>المبرر</th></tr></thead>
          <tbody>${a.consulting_entry_points.map(e => `
            <tr><td>${esc(e.need)}</td><td>${esc(e.jadara_service)}</td><td>${esc(e.rationale)}</td></tr>`).join('')}
          </tbody>
        </table>` : '')}

      ${section('الاختصاص', [
        has(f.mandate) ? `<p>${esc(f.mandate)}</p>` : '',
        bullets('القطاعات', f.sectors),
      ].join(''))}

      ${section('الاستراتيجية', [
        has(f.vision_2030_alignment) ? `<p>${esc(f.vision_2030_alignment)}</p>` : '',
        has(f.published_strategy) ? `<p>${esc(f.published_strategy)}</p>` : '',
        bullets('البرامج والمبادرات', f.programs),
        has(f.stated_challenges)
          ? `<div class="gng-gaps"><h3>تحديات صرّحت بها الجهة</h3><ul>${list(f.stated_challenges)}</ul></div>`
          : '',
      ].join(''))}

      ${section('القيادة', has(f.leadership) ? `
        <table class="gng-table">
          <thead><tr><th>الاسم</th><th>المنصب</th></tr></thead>
          <tbody>${f.leadership.map(l => `
            <tr><td>${esc(l.name)}</td><td>${esc(l.title)}</td></tr>`).join('')}
          </tbody>
        </table>` : '')}

      ${section('الحجم والهيكل', [
        facts([['الميزانية', f.budget], ['عدد الموظفين', f.staff_size]]),
        bullets('الإدارات', f.departments),
        bullets('الشركات التابعة', f.subsidiaries),
      ].join(''))}

      ${section('سلوك المشتريات', [
        facts([['المنصة', f.procurement_platform]]),
        has(f.past_tenders) ? `
          <h3>منافسات سابقة</h3>
          <table class="gng-table">
            <thead><tr><th>العنوان</th><th>المرجع</th><th>التاريخ</th><th>المورّد</th></tr></thead>
            <tbody>${f.past_tenders.map(t => `
              <tr>
                <td>${esc(t.title)}</td><td>${esc(t.reference || '—')}</td>
                <td>${esc(t.date || '—')}</td><td>${esc(t.supplier || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '',
        bullets('موردون واستشاريون معروفون', f.known_suppliers),
      ].join(''))}

      ${section('مؤشرات النضج المؤسسي', [
        bullets('الشهادات', f.certifications),
        bullets('جوائز التميز', f.excellence_awards),
        bullets('مبادرات رقمية', f.digital_initiatives),
      ].join(''))}

      ${section('تطورات حديثة', has(f.recent_developments) ? `
        <table class="gng-table">
          <thead><tr><th>التاريخ</th><th>الخبر</th></tr></thead>
          <tbody>${f.recent_developments.map(d => `
            <tr><td>${esc(d.date || '—')}</td><td>${esc(d.headline)}</td></tr>`).join('')}
          </tbody>
        </table>` : '')}

      ${has(a.unverified) ? `
        <section class="gng-section">
          <h2>ما لم يثبت من مصدر</h2>
          <p class="content-hint">هذه النقاط لم يتمكّن البحث من إثباتها، ولا يُبنى عليها قرار دون تحقق.</p>
          <div class="gng-gaps"><ul>${list(a.unverified)}</ul></div>
        </section>` : ''}

      ${has(p.sources) ? `
        <section class="gng-section gng-section--opinion">
          <h2>المصادر</h2>
          <ul class="prof-sources">${p.sources.map(s => `
            <li><a href="${esc(s.url || s)}" target="_blank" rel="noopener noreferrer">${
              esc(s.title || s.url || s)}</a></li>`).join('')}
          </ul>
        </section>` : ''}
    </article>
  `;
}
