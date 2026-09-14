import { esc } from '../dom.js';

/* Renders a researched entity profile. Everything about a prospective client
   is useful for a bid, so nothing is summarised away — but empty sections are
   dropped rather than rendered as rows of dashes, and anything the research
   couldn't establish is shown as unverified rather than blended in. */

const list = (items) => (items || []).filter(Boolean).map(i => `<li>${esc(i)}</li>`).join('');
const has = (v) => v !== null && v !== undefined && v !== '' && v !== '—';

function facts(pairs) {
  const rows = pairs.filter(([, v]) => has(v));
  if (!rows.length) return '';
  return `<dl class="prof-facts">${rows.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function section(title, body) {
  return body ? `<section class="gng-section"><h2>${esc(title)}</h2>${body}</section>` : '';
}

function bullets(title, items) {
  return (items || []).length ? `<h3>${esc(title)}</h3><ul>${list(items)}</ul>` : '';
}

export function renderProfile(p) {
  if (!p) return '<div class="empty-state">لا يوجد ملف بعد.</div>';
  const id = p.identity || {};

  return `
    <article class="gng-doc" dir="rtl">
      <header class="gng-cover">
        <p class="gng-cover__kicker">ملف تعريفي عن جهة</p>
        <h1 class="gng-cover__title">${esc(id.legal_name || p.entity_name || '—')}</h1>
        ${has(id.name_en) ? `<p class="prof-en" dir="ltr">${esc(id.name_en)}</p>` : ''}
        ${facts([
          ['النوع', id.entity_type],
          ['الجهة الأم', id.parent_entity],
          ['التأسيس', id.established],
          ['المقر', id.headquarters],
          ['الموقع', id.website],
        ])}
      </header>

      ${section('الاختصاص والمهام', [
        has(p.mandate?.summary) ? `<p>${esc(p.mandate.summary)}</p>` : '',
        has(p.mandate?.regulatory_remit) ? `<p>${esc(p.mandate.regulatory_remit)}</p>` : '',
        bullets('القطاعات', p.mandate?.sectors),
        bullets('الخدمات المقدمة', p.mandate?.services_provided),
      ].join(''))}

      ${section('الاستراتيجية والتوجهات', [
        has(p.strategy?.vision_2030_alignment) ? `<p>${esc(p.strategy.vision_2030_alignment)}</p>` : '',
        has(p.strategy?.published_strategy) ? `<p>${esc(p.strategy.published_strategy)}</p>` : '',
        bullets('البرامج والمبادرات', p.strategy?.programs),
        bullets('المستهدفات المعلنة', p.strategy?.stated_targets),
        (p.strategy?.stated_challenges || []).length
          ? `<div class="gng-gaps"><h3>تحديات صرّحت بها الجهة</h3><ul>${list(p.strategy.stated_challenges)}</ul></div>`
          : '',
      ].join(''))}

      ${section('القيادة', (p.leadership || []).length ? `
        <table class="gng-table">
          <thead><tr><th>الاسم</th><th>المنصب</th><th>ملاحظة</th></tr></thead>
          <tbody>${p.leadership.map(l => `
            <tr><td>${esc(l.name)}</td><td>${esc(l.title)}</td><td>${esc(l.note || '—')}</td></tr>`).join('')}
          </tbody>
        </table>` : '')}

      ${section('الحجم والهيكل', [
        facts([
          ['الميزانية', p.scale?.budget],
          ['عدد الموظفين', p.scale?.staff_size],
          ['الفروع', p.scale?.branches],
          ['المستفيدون', p.scale?.beneficiaries],
        ]),
        bullets('الإدارات', p.structure?.departments),
        bullets('الشركات التابعة', p.structure?.subsidiaries),
        bullets('جهات مرتبطة', p.structure?.affiliated_entities),
      ].join(''))}

      ${section('سلوك المشتريات', [
        facts([
          ['المنصة', p.procurement?.platform],
        ]),
        (p.procurement?.observed_tenders || []).length ? `
          <h3>منافسات سابقة</h3>
          <table class="gng-table">
            <thead><tr><th>العنوان</th><th>المرجع</th><th>التاريخ</th><th>ملاحظة</th></tr></thead>
            <tbody>${p.procurement.observed_tenders.map(t => `
              <tr>
                <td>${esc(t.title)}</td><td>${esc(t.reference || '—')}</td>
                <td>${esc(t.date || '—')}</td><td>${esc(t.note || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '',
        bullets('نطاقات متكررة', p.procurement?.typical_scope),
        bullets('موردون واستشاريون معروفون', p.procurement?.known_suppliers),
        has(p.procurement?.contracting_notes) ? `<p class="gng-note">${esc(p.procurement.contracting_notes)}</p>` : '',
      ].join(''))}

      ${section('مؤشرات النضج المؤسسي', [
        bullets('الشهادات', p.maturity_signals?.certifications),
        bullets('جوائز التميز', p.maturity_signals?.excellence_awards),
        bullets('مبادرات رقمية', p.maturity_signals?.digital_initiatives),
        has(p.maturity_signals?.notes) ? `<p>${esc(p.maturity_signals.notes)}</p>` : '',
      ].join(''))}

      ${section('تطورات حديثة', (p.recent_developments || []).length ? `
        <table class="gng-table">
          <thead><tr><th>التاريخ</th><th>الخبر</th><th>الأهمية لنا</th></tr></thead>
          <tbody>${p.recent_developments.map(d => `
            <tr><td>${esc(d.date || '—')}</td><td>${esc(d.headline)}</td><td>${esc(d.relevance || '—')}</td></tr>`).join('')}
          </tbody>
        </table>` : '')}

      ${section('مداخل استشارية لجَدارة', (p.consulting_entry_points || []).length ? `
        <table class="gng-table">
          <thead><tr><th>الحاجة</th><th>خدمة جَدارة</th><th>المبرر</th></tr></thead>
          <tbody>${p.consulting_entry_points.map(e => `
            <tr><td>${esc(e.need)}</td><td>${esc(e.jadara_service)}</td><td>${esc(e.rationale)}</td></tr>`).join('')}
          </tbody>
        </table>` : '')}

      ${has(p.relationship_notes) ? section('ملاحظات العلاقة', `<p>${esc(p.relationship_notes)}</p>`) : ''}

      ${(p.unverified || []).length ? `
        <section class="gng-section">
          <h2>ما لم يثبت من مصدر</h2>
          <p class="content-hint">هذه النقاط لم يتمكّن البحث من إثباتها، ولا يُبنى عليها قرار دون تحقق.</p>
          <div class="gng-gaps"><ul>${list(p.unverified)}</ul></div>
        </section>` : ''}

      ${(p.sources || []).length ? `
        <section class="gng-section gng-section--opinion">
          <h2>المصادر</h2>
          <ul class="prof-sources">${p.sources.map(s => `
            <li>
              <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>
              ${has(s.used_for) ? `<span class="prof-source__use">${esc(s.used_for)}</span>` : ''}
            </li>`).join('')}
          </ul>
        </section>` : ''}
    </article>
  `;
}
