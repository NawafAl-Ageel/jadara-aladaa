import { $, esc, formatDate } from './dom.js';
import {
  loadCriteria, loadAverages, scoreAssessment, generateAssessment,
  saveAssessment, listAssessments, getAssessment, DECISION_LABELS
} from './agent/gonogo-engine.js';
import { renderAssessment } from './agent/gonogo-render.js';
import { renderProfile } from './agent/profile-render.js';
import {
  startProfile, getProfile, listProfiles, pollProfile, resumeProfile, cancelProfile,
  STATUS_LABELS
} from './agent/profiler.js';
import { daysUntil } from './agent/hijri.js';

/* The Agent page. Three capabilities:
   - تعريف الجهات (profiling) — deep background research on any entity.
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
        <h3>تعريف الجهات</h3>
        <p>اكتب اسم أي جهة وأضف ما لديك من مواد، ويذهب الوكيل ليبحث بعمق ويعود بملف كامل عنها.</p>
        <button type="button" class="btn-save" id="newProfileBtn">ملف جديد</button>
      </div>
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
    <div id="agentProfiles"></div>
    <div id="agentList"><p class="qa-empty">جارٍ تحميل التقييمات...</p></div>
  `;
  $('#newProfileBtn').addEventListener('click', () => openProfileIntake());
  $('#newGonogoBtn').addEventListener('click', () => openIntake());
  renderProfileList();
  renderList();
}

/* ---------------- profiling agent ---------------- */

async function renderProfileList() {
  const el = $('#agentProfiles');
  if (!el) return;
  try {
    const rows = await listProfiles();
    if (!rows.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="toolbar"><div class="toolbar__start"><h2 class="toolbar__title">ملفات الجهات</h2></div></div>
      <table class="table">
        <thead><tr><th>الجهة</th><th>الحالة</th><th>التكلفة</th><th>التاريخ</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(r.entity_name)}</td>
              <td><span class="gng-match gng-match--${statusClass(r.status)}">${
                esc(STATUS_LABELS[r.status] || r.status)}</span>${
                r.error ? `<div class="prof-error">${esc(r.error)}</div>` : ''}</td>
              <td>${r.exa_cost ? '$' + Number(r.exa_cost).toFixed(2) : '—'}</td>
              <td>${formatDate(r.created_at)}</td>
              <td>${r.status === 'done'
                ? `<button type="button" class="btn-back" data-open-profile="${r.id}">عرض</button>`
                : r.status === 'researching' || r.status === 'queued'
                  ? `<button type="button" class="btn-back" data-open-profile="${r.id}">متابعة</button>
                     <button type="button" class="btn-back" data-stop-profile="${r.id}">إيقاف</button>`
                  : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.querySelectorAll('[data-open-profile]').forEach(btn => {
      btn.addEventListener('click', () => openProfile(Number(btn.dataset.openProfile)));
    });
    // Stopping from the list, so a run can be called off without opening it.
    el.querySelectorAll('[data-stop-profile]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const ok = await confirmStop(Number(btn.dataset.stopProfile), renderProfileList);
        if (!ok) btn.disabled = false;
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state">تعذر تحميل الملفات: ${esc(err?.message || String(err))}</div>`;
  }
}

function statusClass(status) {
  return status === 'done' ? 'met' : status === 'failed' ? 'gap'
    : status === 'researching' ? 'partial' : 'unknown';
}

/* Asks before stopping, because the run cannot be resumed from where it got
   to — restarting means paying for the research again from zero. */
async function confirmStop(id, onDone) {
  if (!confirm('إيقاف البحث الآن؟ لن يُحفظ ما جُمِع حتى الآن، وتُحتسب تكلفة ما أُنجز قبل الإيقاف.')) return false;
  try {
    const res = await cancelProfile(id);
    // The research finished between the click and the call: nothing was
    // stopped, and the result is already paid for.
    if (res?.raced) {
      alert('انتهى البحث قبل وصول أمر الإيقاف — سيُعرض الملف بعد قليل.');
      return false;
    }
    if (onDone) await onDone();
    return true;
  } catch (err) {
    alert('تعذر الإيقاف: ' + (err?.message || String(err)));
    return false;
  }
}

function openProfileIntake() {
  view = { mode: 'profileIntake' };
  $('#agentContent').innerHTML = `
    <div class="detail-card">
      <div class="detail-card__header">
        <h3>ملف تعريفي عن جهة</h3>
        <button type="button" class="btn-back" id="profBackBtn">رجوع</button>
      </div>
      <div class="detail-card__body">
        <div class="field">
          <label for="profEntity">اسم الجهة</label>
          <input type="text" id="profEntity" placeholder="مثال: وزارة الطاقة">
        </div>
        <div class="field">
          <label for="profAliases">أسماء أو اختصارات أخرى (اختياري)</label>
          <input type="text" id="profAliases" placeholder="مفصولة بفاصلة — مثال: MoEnergy, وزارة البترول سابقاً">
        </div>
        <div class="field">
          <label for="profContext">ما لديك عن الجهة (اختياري)</label>
          <textarea id="profContext" rows="10" placeholder="الصق أي شيء: تقرير سنوي، روابط، مراسلات سابقة، ملاحظات من اجتماع..."></textarea>
          <p class="content-hint">يُعامَل ما تضعه هنا كمصدر موثوق، ويبني الوكيل بحثه فوقه بدل أن يبدأ من الصفر.</p>
        </div>
        <button class="btn-save" id="profStartBtn">ابدأ البحث</button>
        <p class="content-hint">
          يعمل البحث في الخلفية وقد يستغرق عدة دقائق — يمكنك إغلاق الصفحة والعودة لاحقاً،
          فالنتيجة تُحفظ عند اكتمالها.
        </p>
        <p id="profStatus" class="content-hint"></p>
      </div>
    </div>
  `;
  $('#profBackBtn').addEventListener('click', renderHome);
  $('#profStartBtn').addEventListener('click', launchProfile);
}

async function launchProfile() {
  const btn = $('#profStartBtn');
  const status = $('#profStatus');
  const entityName = $('#profEntity').value.trim();
  if (!entityName) { status.textContent = 'اكتب اسم الجهة أولاً.'; return; }

  const aliases = $('#profAliases').value.split(',').map(s => s.trim()).filter(Boolean);
  const context = $('#profContext').value.trim();

  btn.disabled = true;
  btn.textContent = 'جارٍ البدء...';
  try {
    const row = await startProfile({ entityName, aliases, context });
    await openProfile(row.id);
  } catch (err) {
    status.textContent = 'تعذر بدء البحث: ' + (err?.message || String(err));
    btn.disabled = false;
    btn.textContent = 'ابدأ البحث';
  }
}

let stopPolling = null;
let clockTimer = null;

function stopClock() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

function startClock(since) {
  stopClock();
  const started = new Date(since).getTime();
  const tick = () => {
    const el = $('#profElapsed');
    if (!el) return stopClock();
    const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    el.textContent = `منذ ${m}:${s}`;
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

async function openProfile(id) {
  view = { mode: 'profile', id };
  if (stopPolling) { stopPolling(); stopPolling = null; }

  const el = $('#agentContent');
  el.innerHTML = '<p class="qa-empty">جارٍ التحميل...</p>';

  const paint = (row) => {
    // Guard against a poll landing after the user has navigated elsewhere.
    if (view.mode !== 'profile' || view.id !== id) return;
    el.innerHTML = `
      <div class="gng-toolbar">
        <button type="button" class="btn-back" id="profBackBtn">رجوع</button>
        ${row.status === 'done' ? '<button type="button" class="btn-back" id="profPrintBtn">طباعة / حفظ PDF</button>' : ''}
      </div>
      ${row.status === 'researching' || row.status === 'queued' ? `
        <div class="prof-working">
          <h3>${esc(row.entity_name)}</h3>
          <p>الوكيل يبحث الآن. يستغرق ذلك عادة عدة دقائق — يمكنك ترك الصفحة والعودة لاحقاً.</p>
          <div class="prof-bar"><div class="prof-bar__fill"></div></div>
          <div class="prof-stats">
            <span id="profElapsed">—</span>
            ${row.progress_note ? `<span>${esc(row.progress_note)}</span>` : ''}
            ${row.exa_status ? `<span>Exa: ${esc(row.exa_status)}</span>` : ''}
            ${row.stage === 'structuring' ? '<span>المرحلة الأخيرة</span>' : ''}
          </div>
          <div style="margin-top:14px">
            <button type="button" class="btn-back" id="profStopBtn">إيقاف البحث</button>
          </div>
        </div>` : ''}
      ${row.status === 'cancelled' ? `
        <div class="empty-state">
          أُوقف البحث قبل اكتماله، ولم يُحفظ ما جُمِع.
          ${row.exa_cost ? `<div class="content-hint">تكلفة ما أُنجز قبل الإيقاف: $${Number(row.exa_cost).toFixed(2)}</div>` : ''}
          <div style="margin-top:14px"><button type="button" class="btn-save" id="profResumeBtn">بدء بحث جديد</button></div>
        </div>` : ''}
      ${row.status === 'failed' ? `
        <div class="empty-state">
          فشل البحث: ${esc(row.error || 'سبب غير معروف')}
          <div style="margin-top:14px"><button type="button" class="btn-save" id="profResumeBtn">إعادة المحاولة</button></div>
        </div>` : ''}
      ${row.status === 'done' ? renderProfile({
        ...row.profile,
        entity_name: row.entity_name,
        // Exa's grounding shape isn't guaranteed to be a flat array, so only
        // pass it through when it is; the renderer shouldn't have to guess.
        sources: Array.isArray(row.grounding) ? row.grounding
          : Array.isArray(row.grounding?.citations) ? row.grounding.citations : []
      }) : ''}
      ${row.status === 'done' && row.search_count
        ? `<p class="content-hint">اعتمد الملف على ${row.search_count} عملية بحث.</p>` : ''}
    `;
    $('#profBackBtn')?.addEventListener('click', () => {
      if (stopPolling) { stopPolling(); stopPolling = null; }
      stopClock();
      renderHome();
    });
    $('#profPrintBtn')?.addEventListener('click', () => window.print());
    $('#profStopBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'جارٍ الإيقاف...';
      // The poll keeps running until the stop is confirmed: if it turns out
      // the research already finished, the next tick ingests it.
      const stopped = await confirmStop(id, async () => {
        if (stopPolling) { stopPolling(); stopPolling = null; }
        stopClock();
        await openProfile(id);
      });
      if (!stopped) { btn.disabled = false; btn.textContent = 'إيقاف البحث'; }
    });
    $('#profResumeBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "جارٍ البدء...";
      // A fresh Exa run either way: neither a failed nor a stopped run leaves
      // anything behind to continue from.
      try {
        await resumeProfile(id);
        await openProfile(id);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = label;
        alert("تعذر إعادة المحاولة: " + (err?.message || String(err)));
      }
    });

    // The poll is every few seconds; the clock ticks every second so the run
    // reads as alive between updates rather than frozen.
    if (row.status === 'researching' || row.status === 'queued') {
      startClock(row.started_at || row.created_at);
    } else {
      stopClock();
    }
  };

  try {
    const row = await getProfile(id);
    paint(row);
    if (row.status === 'queued' || row.status === 'researching') {
      stopPolling = pollProfile(id, paint);
    }
  } catch (err) {
    el.innerHTML = `<div class="empty-state">تعذر عرض الملف: ${esc(err?.message || String(err))}</div>`;
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
