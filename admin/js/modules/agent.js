import { $, esc, formatDate } from './dom.js';
import {
  loadCriteria, loadAverages, scoreAssessment, generateAssessment,
  saveAssessment, listAssessments, getAssessment, DECISION_LABELS,
  loadCapabilities, loadProfile, researchJadara, confirmCapability
} from './agent/gonogo-engine.js';
import { renderAssessment } from './agent/gonogo-render.js';
import { daysUntil } from './agent/hijri.js';

/* The Agent page. Two capabilities:
   - قرار المشاركة (Go/No-Go) — live.
   - العرض الفني (technical proposal) — not built yet; the card says so
     rather than offering a button that does nothing. */

let view = { mode: 'home' };

export async function loadAgent() {
  if (view.mode === 'home') return renderHome();
}

export function bindAgentEvents() {
  $('#newProposalBtn')?.addEventListener('click', () => openIntake());
}

/* ---------------- home ---------------- */

async function renderHome() {
  view = { mode: 'home' };
  const el = $('#agentContent');
  el.innerHTML = `
    <div class="agent-caps">
      <div class="agent-cap agent-cap--live">
        <span class="agent-cap__status">متاح</span>
        <h3>قرار المشاركة (Go / No-Go)</h3>
        <p>يقرأ كراسة الشروط، يبحث عن الجهة المصدرة، ثم يُصدر تقييماً مرجّحاً بقرار مشاركة وتوصية.</p>
        <button type="button" class="btn-save" id="newGonogoBtn">تقييم جديد</button>
      </div>
      <div class="agent-cap">
        <span class="agent-cap__status agent-cap__status--soon">قيد الإنشاء</span>
        <h3>العرض الفني</h3>
        <p>يحوّل نطاق العمل إلى عرض فني كامل يُنشر كصفحة ويب برابط خاص بالعميل.</p>
      </div>
    </div>
    <div id="agentProfile"></div>
    <div id="agentList"><p class="qa-empty">جارٍ تحميل التقييمات...</p></div>
  `;
  $('#newGonogoBtn').addEventListener('click', () => openIntake());
  renderProfile();
  renderList();
}

/* ---------------- Jadara's own profile ---------------- */

const SOURCE_LABELS = {
  seeded: 'من تقييمات سابقة',
  public_research: 'بحث عام — غير مؤكد',
  confirmed: 'مؤكد'
};

async function renderProfile() {
  const el = $('#agentProfile');
  if (!el) return;

  const [profile, caps] = await Promise.all([loadProfile(), loadCapabilities()]);
  const unverified = caps.filter(c => !c.verified).length;
  const noHeadcount = caps.filter(c => c.headcount === null || c.headcount === undefined).length;

  el.innerHTML = `
    <details class="gng-profile" ${profile ? '' : 'open'}>
      <summary>ملف قدرات جَدارة ${caps.length ? `· ${caps.length} مجال` : ''}${
        unverified ? ` · <strong>${unverified} غير مؤكد</strong>` : ''}</summary>

      <p class="content-hint">
        يُستخدم هذا الملف لمطابقة متطلبات فريق العمل في كل كراسة. البحث العام يملأ الخدمات
        والاعتمادات والعملاء المعلنين فقط — أما أعداد الفريق ومن يحمل شهادات المقيّمين
        (EFQM / KAQA) ونسبة السعودة فلا تُنشر علناً، ويلزم إدخالها يدوياً.
      </p>

      <div class="gng-toolbar">
        <button type="button" class="btn-save" id="researchJadaraBtn">ابحث عن جَدارة تلقائياً</button>
      </div>
      <p id="researchStatus" class="content-hint"></p>

      ${noHeadcount ? `
        <p class="gng-deadline gng-deadline--tight">
          ${noHeadcount} من ${caps.length} مجالات بلا عدد فريق مسجّل — ستظهر متطلبات الكراسة
          المقابلة لها بحالة "يحتاج تحقق" بدل "متوفر".
        </p>` : ''}

      ${profile ? `
        <h3>الملف العام</h3>
        ${profile.summary ? `<p>${esc(profile.summary)}</p>` : ''}
        ${(profile.services || []).length ? `<h4>الخدمات المعلنة</h4><ul>${
          profile.services.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
        ${(profile.accreditations || []).length ? `<h4>اعتمادات الشركة</h4><ul>${
          profile.accreditations.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
        ${(profile.published_clients || []).length ? `<h4>عملاء معلنون</h4><ul>${
          profile.published_clients.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
        ${(profile.limitations || []).length ? `
          <div class="gng-gaps">
            <h4>ما لم يستطع البحث إثباته</h4>
            <ul>${profile.limitations.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
          </div>` : ''}
        ${profile.researched_at ? `<p class="content-hint">آخر بحث: ${formatDate(profile.researched_at)}</p>` : ''}
      ` : ''}

      ${caps.length ? `
        <h3>مجالات القدرة</h3>
        <table class="gng-table">
          <thead><tr><th>المجال</th><th>الدور</th><th>الشهادات</th><th>العدد</th><th>المصدر</th><th></th></tr></thead>
          <tbody>${caps.map(c => `
            <tr>
              <td>${esc(c.area)}</td>
              <td>${esc(c.role || '—')}</td>
              <td>${(c.certifications || []).length ? esc(c.certifications.join('، ')) : '—'}</td>
              <td>
                <input type="number" min="0" class="inline-input gng-headcount"
                       data-cap="${c.id}" value="${c.headcount ?? ''}" placeholder="—" style="width:70px">
              </td>
              <td><span class="gng-match gng-match--${c.verified ? 'met' : 'unknown'}">${
                esc(SOURCE_LABELS[c.source] || c.source)}</span></td>
              <td><button type="button" class="btn-back" data-confirm-cap="${c.id}">تأكيد</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="content-hint">أدخل العدد ثم اضغط "تأكيد" — الصفوف المؤكدة لا يستبدلها البحث التلقائي.</p>
      ` : ''}
    </details>
  `;

  $('#researchJadaraBtn').addEventListener('click', runResearch);
  el.querySelectorAll('[data-confirm-cap]').forEach(btn => {
    btn.addEventListener('click', () => confirmRow(Number(btn.dataset.confirmCap), btn));
  });
}

async function runResearch() {
  const btn = $('#researchJadaraBtn');
  const status = $('#researchStatus');
  btn.disabled = true;
  btn.textContent = 'جارٍ البحث...';
  status.textContent = 'يبحث في المصادر العامة عن جَدارة الأداء. قد يستغرق ذلك دقيقة.';
  try {
    await researchJadara();
    await renderProfile();
  } catch (err) {
    status.textContent = 'تعذر البحث: ' + (err?.message || String(err));
    btn.disabled = false;
    btn.textContent = 'ابحث عن جَدارة تلقائياً';
  }
}

async function confirmRow(id, btn) {
  const input = $(`.gng-headcount[data-cap="${id}"]`);
  const raw = input?.value.trim();
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await confirmCapability(id, { headcount: raw === '' ? null : Number(raw) });
    await renderProfile();
  } catch (err) {
    alert('تعذر التأكيد: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'تأكيد';
  }
}

async function renderList() {
  const el = $('#agentList');
  try {
    const rows = await listAssessments();
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">لا توجد تقييمات بعد. ابدأ بتقييم جديد.</div>`;
      return;
    }
    el.innerHTML = `
      <table class="table">
        <thead><tr><th>الجهة</th><th>المشروع</th><th>المرجع</th><th>الدرجة</th><th>القرار</th><th>التاريخ</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(r.entity_name)}</td>
              <td>${esc(r.project_title || '—')}</td>
              <td>${esc(r.rfp_reference || '—')}</td>
              <td><strong>${r.total_score ?? '—'}</strong></td>
              <td><span class="badge badge--gng-${esc(r.decision)}">${esc(DECISION_LABELS[r.decision] || r.decision)}</span></td>
              <td>${formatDate(r.created_at)}</td>
              <td><button type="button" class="btn-back" data-open-gng="${r.id}">عرض</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('[data-open-gng]').forEach(btn => {
      btn.addEventListener('click', () => openAssessment(Number(btn.dataset.openGng)));
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state">تعذر تحميل التقييمات: ${esc(err?.message || String(err))}</div>`;
  }
}

/* ---------------- intake ---------------- */

function openIntake() {
  view = { mode: 'intake' };
  const el = $('#agentContent');
  el.innerHTML = `
    <div class="detail-card">
      <div class="detail-card__header">
        <h3>تقييم قرار المشاركة</h3>
        <button type="button" class="btn-back" id="gngBackBtn">رجوع</button>
      </div>
      <div class="detail-card__body">
        <div class="field">
          <label for="gngEntity">الجهة المصدرة</label>
          <input type="text" id="gngEntity" placeholder="مثال: هيئة التأمين">
          <p class="content-hint">يُستخدم للبحث عن الجهة في المصادر العامة وبناء ملف تعريفي عنها.</p>
        </div>
        <div class="field">
          <label for="gngRfp">نص كراسة الشروط / طلب تقديم العروض</label>
          <textarea id="gngRfp" rows="14" placeholder="الصق نص الكراسة هنا..."></textarea>
          <p class="content-hint">الصق أكبر قدر من النص: النطاق، المخرجات، المدة، شروط التأهيل، ومعايير التقييم.</p>
        </div>
        <button class="btn-save" id="gngGenerateBtn">إنشاء التقييم</button>
        <p id="gngStatus" class="content-hint"></p>
      </div>
    </div>
  `;
  $('#gngBackBtn').addEventListener('click', renderHome);
  $('#gngGenerateBtn').addEventListener('click', runGeneration);
}

async function runGeneration() {
  const btn = $('#gngGenerateBtn');
  const status = $('#gngStatus');
  const rfpText = $('#gngRfp').value.trim();
  const entityName = $('#gngEntity').value.trim();

  if (rfpText.length < 200) {
    status.textContent = 'النص قصير جداً — الصق نص الكراسة كاملاً (200 حرف على الأقل).';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جارٍ التحليل...';
  status.textContent = 'يبحث عن الجهة ويقرأ الكراسة. قد يستغرق ذلك دقيقة أو أكثر.';

  try {
    const result = await generateAssessment({ rfpText, entityName });
    const criteria = await loadCriteria();
    const scoring = scoreAssessment(result.assessment, criteria);

    const row = await saveAssessment({
      assessment: result.assessment,
      extraction: result.extraction,
      deadline: result.deadline,
      entityProfile: result.entity_profile,
      model: result.model,
      sourceText: rfpText,
      scoring
    });

    await openAssessment(row.id);
  } catch (err) {
    status.textContent = 'تعذر إنشاء التقييم: ' + (err?.message || String(err));
    btn.disabled = false;
    btn.textContent = 'إنشاء التقييم';
  }
}

/* ---------------- view one assessment ---------------- */

/* Days-remaining is recomputed on every view rather than read from the row.
   An assessment saved with "متبقٍ 7 أيام" is misleading a fortnight later,
   and the deadline is the factor most likely to flip the decision. */
function liveDeadline(row) {
  if (!row.submission_deadline && !row.submission_deadline_hijri) return null;
  return {
    hijri: row.submission_deadline_hijri,
    gregorian: row.submission_deadline,
    days_remaining: row.submission_deadline ? daysUntil(new Date(row.submission_deadline)) : null
  };
}

async function openAssessment(id) {
  view = { mode: 'assessment', id };
  const el = $('#agentContent');
  el.innerHTML = '<p class="qa-empty">جارٍ التحميل...</p>';

  try {
    const [{ row, scores }, criteria, averages] = await Promise.all([
      getAssessment(id), loadCriteria(), loadAverages()
    ]);

    // Score from the stored rows rather than recomputing from content, so an
    // old assessment always renders the numbers it was actually saved with.
    const byKey = Object.fromEntries(scores.map(s => [s.criterion_key, Number(s.score)]));
    const rows = criteria.map(c => {
      const score = byKey[c.key] ?? 0;
      return {
        key: c.key,
        label_ar: c.label_ar,
        weight: Number(c.weight),
        score,
        weighted: Math.round(score * Number(c.weight) * 10 * 100) / 100
      };
    });
    const scoring = { rows, total: Number(row.total_score), decision: row.decision };

    el.innerHTML = `
      <div class="gng-toolbar">
        <button type="button" class="btn-back" id="gngBackBtn">رجوع للقائمة</button>
        <button type="button" class="btn-back" id="gngPrintBtn">طباعة / حفظ PDF</button>
      </div>
      ${renderAssessment(row.content, scoring, averages, row.extraction, liveDeadline(row))}
      ${row.entity_profile?.text ? `
        <details class="gng-profile">
          <summary>ملف الجهة الذي بُني عليه التقييم (من بحث في المصادر العامة)</summary>
          <p>${esc(row.entity_profile.text)}</p>
        </details>` : ''}
    `;
    $('#gngBackBtn').addEventListener('click', renderHome);
    $('#gngPrintBtn').addEventListener('click', () => window.print());
  } catch (err) {
    el.innerHTML = `<div class="empty-state">تعذر عرض التقييم: ${esc(err?.message || String(err))}</div>`;
  }
}
