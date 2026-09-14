import { esc } from '../dom.js';
import { DECISION_LABELS } from './gonogo-engine.js';

/* Renders a Go/No-Go assessment as the client-facing document, mirroring the
   section order of Jadara's existing decks (executive summary → opportunity →
   alignment → capabilities → commercial → risk → competitive → decision
   matrix → recommendation → consultant opinion). */

const RISK_LABELS = { red: 'أحمر', amber: 'برتقالي', green: 'أخضر' };

const list = (items) =>
  (items || []).filter(Boolean).map(i => `<li>${esc(i)}</li>`).join('');

const num = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('en-US'));

/* The benchmark row the reader compares against. Sample size is shown
   deliberately: an "average" over one or two prior assessments is noise, and
   presenting it as a benchmark without saying so would mislead. */
function benchmarkCell(score, avg, sampleSize) {
  if (avg === null || avg === undefined || !sampleSize) {
    return `<span class="gng-bench gng-bench--none">لا يوجد متوسط بعد</span>`;
  }
  const delta = Math.round((score - Number(avg)) * 100) / 100;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '■';
  const sign = delta > 0 ? '+' : '';
  const thin = sampleSize < 3 ? ` <span class="gng-bench__thin">(متوسط أولي، ${sampleSize} تقييم)</span>` : '';
  return `<span class="gng-bench gng-bench--${dir}">${arrow} ${sign}${delta.toFixed(2)} مقابل متوسط ${Number(avg).toFixed(2)}</span>${thin}`;
}

function decisionMatrix(scoring, averages) {
  const byKey = Object.fromEntries((averages || []).map(a => [a.key, a]));
  const rows = scoring.rows.map(r => {
    const avg = byKey[r.key];
    return `
      <tr>
        <td>${esc(r.label_ar)}</td>
        <td>${Math.round(r.weight * 100)}%</td>
        <td class="gng-score">${r.score.toFixed(1)}</td>
        <td>${r.weighted.toFixed(2)}</td>
        <td>${benchmarkCell(r.score, avg?.average_score, Number(avg?.sample_size || 0))}</td>
      </tr>`;
  }).join('');

  return `
    <table class="gng-table">
      <thead>
        <tr><th>المعيار</th><th>الوزن</th><th>الدرجة (1-10)</th><th>المرجّح</th><th>مقارنة بالمتوسط</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">المجموع المرجّح</td>
          <td colspan="2"><strong>${scoring.total.toFixed(2)} / 100</strong></td>
        </tr>
      </tfoot>
    </table>
    <p class="gng-bands">معيار القرار: 80-100 مشاركة · 60-79 مشاركة بشروط · 40-59 حدّي · أقل من 40 عدم مشاركة</p>
  `;
}

export function renderAssessment(assessment, scoring, averages) {
  const a = assessment || {};
  const meta = a.meta || {};
  const dec = scoring.decision;

  return `
    <article class="gng-doc" dir="rtl">
      <header class="gng-cover gng-cover--${esc(dec)}">
        <p class="gng-cover__kicker">تقييم قرار المشاركة / عدم المشاركة</p>
        <h1 class="gng-cover__title">${esc(meta.project_title || 'فرصة غير معنونة')}</h1>
        <dl class="gng-cover__meta">
          <div><dt>العميل</dt><dd>${esc(meta.entity_name || '—')}</dd></div>
          <div><dt>مرجع الطلب</dt><dd>${esc(meta.rfp_reference || '—')}</dd></div>
          <div><dt>القطاع</dt><dd>${esc(meta.sector || '—')}</dd></div>
          <div><dt>نوع الفرصة</dt><dd>${esc(meta.opportunity_type || '—')}</dd></div>
          <div><dt>الموعد النهائي</dt><dd>${esc(meta.submission_deadline || '—')}</dd></div>
          <div><dt>المدة المتوقعة</dt><dd>${esc(meta.expected_duration || '—')}</dd></div>
        </dl>
        <div class="gng-verdict gng-verdict--${esc(dec)}">
          <span class="gng-verdict__label">${esc(DECISION_LABELS[dec] || dec)}</span>
          <span class="gng-verdict__score">${scoring.total.toFixed(2)} / 100</span>
        </div>
      </header>

      <section class="gng-section">
        <h2>الملخص التنفيذي</h2>
        <div class="gng-cols">
          <div><h3>نظرة عامة على الفرصة</h3><ul>${list(a.executive_summary?.opportunity_overview)}</ul></div>
          <div><h3>الأهمية الاستراتيجية</h3><ul>${list(a.executive_summary?.strategic_importance)}</ul></div>
        </div>
        ${a.executive_summary?.critical_alert
          ? `<p class="gng-alert">${esc(a.executive_summary.critical_alert)}</p>` : ''}
      </section>

      <section class="gng-section">
        <h2>نظرة عامة على الفرصة</h2>
        <p class="gng-objective">${esc(a.scope?.objective || '')}</p>
        <div class="gng-cards">
          ${(a.scope?.workstreams || []).map((w, i) => `
            <div class="gng-card">
              <span class="gng-card__index">المسار ${i + 1}</span>
              <h4>${esc(w.title)}</h4>
              <p>${esc(w.description)}</p>
            </div>`).join('')}
        </div>
        ${(a.scope?.deliverables || []).length ? `
          <h3>المخرجات الرئيسية</h3>
          <table class="gng-table">
            <thead><tr><th>#</th><th>المخرج</th><th>الكمية</th></tr></thead>
            <tbody>${a.scope.deliverables.map((d, i) =>
              `<tr><td>${i + 1}</td><td>${esc(d.name)}</td><td>${esc(d.quantity)}</td></tr>`).join('')}
            </tbody>
          </table>` : ''}
        ${(a.scope?.stakeholders || []).length
          ? `<h3>أصحاب المصلحة</h3><ul>${list(a.scope.stakeholders)}</ul>` : ''}
      </section>

      <section class="gng-section">
        <h2>التوافق الاستراتيجي لجَدارة <span class="gng-pill">${Number(a.strategic_alignment?.score ?? 0).toFixed(1)}/10</span></h2>
        <table class="gng-table">
          <thead><tr><th>البُعد</th><th>التقييم</th><th>المستوى</th></tr></thead>
          <tbody>${(a.strategic_alignment?.rows || []).map(r =>
            `<tr><td>${esc(r.dimension)}</td><td>${esc(r.assessment)}</td><td>${esc(r.rating)}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>

      <section class="gng-section">
        <h2>تقييم القدرات والموارد <span class="gng-pill">${Number(a.capabilities?.score ?? 0).toFixed(1)}/10</span></h2>
        <table class="gng-table">
          <thead><tr><th>القدرة</th><th>المستوى</th><th>التقييم</th></tr></thead>
          <tbody>${(a.capabilities?.rows || []).map(r =>
            `<tr><td>${esc(r.dimension)}</td><td>${esc(r.level)}</td><td>${esc(r.assessment)}</td></tr>`).join('')}
          </tbody>
        </table>
        ${(a.capabilities?.gaps || []).length
          ? `<div class="gng-gaps"><h3>فجوات القدرات الواجب معالجتها</h3><ul>${list(a.capabilities.gaps)}</ul></div>` : ''}
      </section>

      <section class="gng-section">
        <h2>الفرصة التجارية والمالية <span class="gng-pill">${Number(a.commercial?.score ?? 0).toFixed(1)}/10</span></h2>
        <div class="gng-stats">
          <div class="gng-stat"><span class="gng-stat__value">${num(a.commercial?.estimated_value_min)} - ${num(a.commercial?.estimated_value_max)}</span><span class="gng-stat__label">القيمة التقديرية للعقد (ريال)</span></div>
          <div class="gng-stat"><span class="gng-stat__value">${num(a.commercial?.profit_margin_min)}% - ${num(a.commercial?.profit_margin_max)}%</span><span class="gng-stat__label">هامش الربح المتوقع</span></div>
          <div class="gng-stat"><span class="gng-stat__value">${esc(a.commercial?.duration || '—')}</span><span class="gng-stat__label">مدة المشروع</span></div>
          <div class="gng-stat"><span class="gng-stat__value">${esc(a.commercial?.team_size || '—')}</span><span class="gng-stat__label">الفريق المطلوب</span></div>
        </div>
        <div class="gng-cols">
          <div><h3>التحليل المالي</h3><ul>${list(a.commercial?.analysis)}</ul></div>
          <div><h3>القيمة طويلة المدى</h3><ul>${list(a.commercial?.long_term_value)}</ul></div>
        </div>
      </section>

      <section class="gng-section">
        <h2>تقييم المخاطر <span class="gng-pill">${Number(a.risks?.score ?? 0).toFixed(1)}/10</span></h2>
        <table class="gng-table">
          <thead><tr><th>فئة المخاطر</th><th>التصنيف</th><th>التقييم</th><th>المعالجة</th></tr></thead>
          <tbody>${(a.risks?.matrix || []).map(r => `
            <tr>
              <td>${esc(r.category)}</td>
              <td><span class="gng-rag gng-rag--${esc(r.level)}">${esc(RISK_LABELS[r.level] || r.level)}</span></td>
              <td>${esc(r.assessment)}</td>
              <td>${esc(r.mitigation)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${a.risks?.overall_note ? `<p class="gng-note">${esc(a.risks.overall_note)}</p>` : ''}
      </section>

      <section class="gng-section">
        <h2>التموضع التنافسي واحتمالية الفوز <span class="gng-pill">${Number(a.competitive?.score ?? 0).toFixed(1)}/10</span></h2>
        <p class="gng-winprob">احتمالية الفوز المقدّرة: <strong>${num(a.competitive?.win_probability_min)}% - ${num(a.competitive?.win_probability_max)}%</strong></p>
        <div class="gng-cols">
          <div><h3>المنافسون المحتملون</h3><ul>${list(a.competitive?.competitors)}</ul></div>
          <div><h3>مميزات جَدارة</h3><ul>${list(a.competitive?.jadara_advantages)}</ul></div>
        </div>
        <div class="gng-cols">
          <div class="gng-swot gng-swot--strong"><h3>نقاط القوة</h3><ul>${list(a.competitive?.strengths)}</ul></div>
          <div class="gng-swot gng-swot--weak"><h3>نقاط الضعف</h3><ul>${list(a.competitive?.weaknesses)}</ul></div>
        </div>
        ${a.competitive?.decisive_factor
          ? `<p class="gng-note"><strong>العامل الحاسم:</strong> ${esc(a.competitive.decisive_factor)}</p>` : ''}
      </section>

      <section class="gng-section">
        <h2>مصفوفة قرار المشاركة / عدم المشاركة</h2>
        ${decisionMatrix(scoring, averages)}
      </section>

      <section class="gng-section">
        <h2>التوصية</h2>
        <div class="gng-verdict gng-verdict--${esc(dec)} gng-verdict--inline">
          <span class="gng-verdict__label">${esc(DECISION_LABELS[dec] || dec)}</span>
        </div>
        <div class="gng-cols">
          <div><h3>لماذا تناسب هذه الفرصة جَدارة</h3><ul>${list(a.recommendation?.why_suitable)}</ul></div>
          <div><h3>الشروط المطلوبة قبل المضي</h3><ul>${list(a.recommendation?.conditions)}</ul></div>
        </div>
        ${(a.recommendation?.immediate_steps || []).length ? `
          <h3>الخطوات الفورية التالية</h3>
          <ul class="gng-steps">${a.recommendation.immediate_steps.map(s =>
            `<li><strong>${esc(s.when)}:</strong> ${esc(s.action)}</li>`).join('')}</ul>` : ''}
      </section>

      <section class="gng-section gng-section--opinion">
        <h2>الرأي المهني للمستشار</h2>
        <p class="gng-opinion__verdict">${esc(a.consultant_opinion?.verdict_line || '')}</p>
        ${(a.consultant_opinion?.prose || []).map(p => `<p>${esc(p)}</p>`).join('')}
        ${(a.consultant_opinion?.missing_information || []).length ? `
          <div class="gng-missing">
            <h3>معلومات مفقودة</h3>
            <ul>${list(a.consultant_opinion.missing_information)}</ul>
          </div>` : ''}
      </section>
    </article>
  `;
}
