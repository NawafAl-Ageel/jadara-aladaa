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

const MATCH_LABELS = { met: 'متوفر', partial: 'جزئي', gap: 'فجوة', unknown: 'يحتاج تحقق' };

/* The tender's own hard requirements, quoted from the document rather than
   inferred. These are what actually decide the bid — the required-team table
   in particular — so they're shown as facts, visually separate from the
   assessment's judgement. */
function requirementsSection(ex, deadline) {
  if (!ex) return '';
  const ev = ex.evaluation || {};
  const team = ex.team_requirements || [];
  const g = ex.guarantees || {};
  const p = ex.penalties || {};

  const facts = [
    ev.disclosed && ev.technical_weight ? `التقييم الفني ${ev.technical_weight}% · المالي ${ev.financial_weight}%` : null,
    ev.technical_pass_threshold ? `نسبة الاجتياز الفني ${ev.technical_pass_threshold}` : null,
    g.bid_bond_percent ? `ضمان ابتدائي ${g.bid_bond_percent}%` : null,
    g.performance_bond_percent ? `ضمان نهائي ${g.performance_bond_percent}%` : null,
    g.offer_validity_days ? `صلاحية العرض ${g.offer_validity_days} يوماً` : null,
    ex.saudization?.required_percent ? `توطين ${ex.saudization.required_percent}%` : null,
    p.cap_percent ? `سقف الغرامات ${p.cap_percent}%` : null,
    ex.subcontracting?.allowed ? `تعاقد من الباطن حتى ${ex.subcontracting.max_percent || '—'}%` : null,
    ex.tender?.document_cost ? `تكلفة الكراسة ${ex.tender.document_cost}` : null,
  ].filter(Boolean);

  return `
    <section class="gng-section">
      <h2>متطلبات الكراسة <span class="gng-pill gng-pill--fact">مستخرجة من الوثيقة</span></h2>
      ${deadline?.hijri ? `
        <p class="gng-deadline ${deadlineClass(deadline.days_remaining)}">
          الموعد النهائي: ${esc(deadline.hijri)} هـ
          ${deadline.gregorian ? ` (${esc(deadline.gregorian)} م)` : ''}
          ${deadline.days_remaining !== null && deadline.days_remaining !== undefined
            ? ` — ${deadlineText(deadline.days_remaining)}` : ''}
        </p>` : ''}
      ${facts.length ? `<ul class="gng-facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${ev.technical_criteria?.length ? `
        <h3>أوزان التقييم الفني</h3>
        <table class="gng-table">
          <thead><tr><th>المعيار</th><th>الوزن</th></tr></thead>
          <tbody>${ev.technical_criteria.map(c =>
            `<tr><td>${esc(c.name)}</td><td>${esc(String(c.weight ?? '—'))}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}
      ${team.length ? `
        <h3>فريق العمل المطلوب</h3>
        <table class="gng-table">
          <thead><tr><th>المسمى</th><th>العدد</th><th>المؤهل</th><th>الخبرة</th><th>الشهادات</th><th>الحضور</th></tr></thead>
          <tbody>${team.map(t => `
            <tr>
              <td>${esc(t.role)}</td>
              <td>${esc(String(t.count ?? '—'))}</td>
              <td>${esc(t.min_qualification || '—')}</td>
              <td>${t.min_years ? esc(String(t.min_years)) + ' سنوات' : '—'}</td>
              <td>${(t.certifications || []).length ? esc((t.certifications || []).join('، ')) : '—'}</td>
              <td>${esc(t.onsite || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : ''}
      ${(ex.compliance || []).length
        ? `<h3>متطلبات الامتثال</h3><ul>${list(ex.compliance)}</ul>` : ''}
      ${(ex.missing || []).length
        ? `<div class="gng-gaps"><h3>غير مفصح عنه في الكراسة</h3><ul>${list(ex.missing)}</ul></div>` : ''}
    </section>
  `;
}

function deadlineClass(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return 'gng-deadline--expired';
  if (days <= 10) return 'gng-deadline--critical';
  if (days <= 20) return 'gng-deadline--tight';
  return '';
}

function deadlineText(days) {
  if (days < 0) return `انقضى منذ ${Math.abs(days)} يوماً`;
  if (days === 0) return 'ينتهي اليوم';
  return `متبقٍ ${days} يوماً`;
}

export function renderAssessment(assessment, scoring, averages, extraction, deadline) {
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

      ${requirementsSection(extraction, deadline)}

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
        ${(a.capabilities?.requirement_match || []).length ? `
          <h3>مطابقة متطلبات الكراسة بقدرات جَدارة</h3>
          <table class="gng-table">
            <thead><tr><th>المتطلب</th><th>وضع جَدارة</th><th>الحالة</th></tr></thead>
            <tbody>${a.capabilities.requirement_match.map(r => `
              <tr>
                <td>${esc(r.requirement)}</td>
                <td>${esc(r.jadara_position)}</td>
                <td><span class="gng-match gng-match--${esc(r.status)}">${esc(MATCH_LABELS[r.status] || r.status)}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>` : ''}
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
