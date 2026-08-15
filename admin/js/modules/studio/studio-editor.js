import { $, esc, formatDate } from '../dom.js';
import { getSupabase } from '../supabase-client.js';
import { showPage } from '../nav.js';
import { logAudit } from '../audit.js';
import { CANONICAL_FIELDS, canonicalFieldLabels, chartTypeLabels, aggregationLabels } from './constants.js';
import { parseFile, suggestColumnMap, applyColumnMap, distinctValues } from './dataset-parser.js';
import { renderDeliverable, instantiateCharts } from './report-render.js';
import { setPrintContent, showPrintOverlay } from '../print-overlay.js';
import { generateInsight } from './ai-insights.js';

const statusLabels = {
  draft: 'مسودة', in_review: 'قيد المراجعة', approved: 'معتمد', published: 'منشور', archived: 'مؤرشف'
};

const METRIC_PRESET_LABELS = {
  count: 'إجمالي عدد الصفوف',
  sum_estimated_value: 'إجمالي القيمة التقديرية',
  distinct_entity: 'عدد الجهات',
  distinct_competitor: 'عدد المنافسين'
};

let draggedSectionId = null;
let editorState = { deliverable: null, sections: [], dataset: null };

export async function openDeliverableEditor(id) {
  showPage('studioEditorPage');
  $('#studioEditorContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const sb = getSupabase();
    const [{ data: deliverable, error }, { data: sections }, { data: datasets }] = await Promise.all([
      sb.from('consulting_deliverables').select('*').eq('id', id).single(),
      sb.from('consulting_sections').select('*').eq('deliverable_id', id).order('sort_order'),
      sb.from('consulting_datasets').select('*').eq('deliverable_id', id).order('created_at', { ascending: false }).limit(1)
    ]);
    if (error) throw error;
    let clientName = '';
    if (deliverable.client_id) {
      const { data: c } = await sb.from('clients').select('name').eq('id', deliverable.client_id).single();
      clientName = c?.name || '';
    }
    editorState = { deliverable, sections: sections || [], dataset: (datasets && datasets[0]) || null, clientName };
    render();
  } catch {
    $('#studioEditorContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل التقرير</p>';
  }
}

function render() {
  const { deliverable, dataset } = editorState;
  $('#studioEditorContent').innerHTML = `
    <div class="detail-main">
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>${esc(deliverable.name)}</h3>
          <span class="badge badge--studio-${esc(deliverable.status)}">${esc(statusLabels[deliverable.status] || deliverable.status)}</span>
        </div>
        <div class="detail-card__body">
          ${dataset ? `
            <p class="content-hint">البيانات: ${esc(dataset.file_name || 'يدوي')} · ${dataset.row_count} صف · تم الرفع ${formatDate(dataset.created_at)}</p>
            <button type="button" class="btn-back" id="reuploadBtn">استبدال البيانات</button>
          ` : `<p class="content-hint">لم يتم رفع بيانات بعد.</p>`}
          <div id="uploadArea"></div>
        </div>
      </div>

      ${dataset ? `
        <div class="detail-card">
          <div class="detail-card__header"><h3>أقسام التقرير</h3></div>
          <div class="detail-card__body">
            <p class="content-hint">اسحب لإعادة الترتيب. فعّل/عطّل الأقسام واضبط إعداداتها.</p>
            <div id="sectionsList">${renderSectionsList()}</div>
            <button class="btn-save" id="saveSectionsBtn" style="margin-top:16px">حفظ الترتيب والإعدادات</button>
          </div>
        </div>
      ` : ''}
    </div>

    <div class="detail-sidebar">
      <div class="sidebar-card">
        <h3>معلومات التقرير</h3>
        <div class="meta-row"><span class="detail-label">العميل</span><span class="detail-value">${esc(editorState.clientName || '—')}</span></div>
        <div class="meta-row"><span class="detail-label">اللغة</span><span class="detail-value">${deliverable.language === 'en' ? 'English' : 'العربية'}</span></div>
        <div class="meta-row"><span class="detail-label">آخر تحديث</span><span class="detail-value">${formatDate(deliverable.updated_at)}</span></div>
      </div>
      <div class="sidebar-card">
        <button class="btn-save" id="previewBtn" style="width:100%" ${dataset ? '' : 'disabled'}>معاينة التقرير</button>
      </div>
    </div>
  `;

  if (!dataset) mountUploadForm();
  $('#reuploadBtn')?.addEventListener('click', mountUploadForm);
  $('#saveSectionsBtn')?.addEventListener('click', saveSections);
  $('#previewBtn')?.addEventListener('click', showPreview);
  if (dataset) bindSectionsList();
}

/* ---------- Upload / replace dataset ---------- */

function mountUploadForm() {
  const area = $('#uploadArea');
  area.innerHTML = `
    <input type="file" id="editorFileInput" accept=".csv,.xlsx,.xls">
    <div id="editorMappingArea"></div>
  `;
  let headers = [], rawRows = [], columnMap = {};

  $('#editorFileInput').addEventListener('change', async () => {
    const file = $('#editorFileInput').files[0];
    if (!file) return;
    const mapArea = $('#editorMappingArea');
    mapArea.innerHTML = '<p class="qa-empty">جارٍ التحليل...</p>';
    try {
      const parsed = await parseFile(file);
      headers = parsed.headers;
      rawRows = parsed.rawRows;
      columnMap = suggestColumnMap(headers);
      renderMap();
    } catch (err) {
      mapArea.innerHTML = `<p style="color:#dc2626">${esc(err.message)}</p>`;
    }

    function renderMap() {
      mapArea.innerHTML = `
        <p class="content-hint" style="margin-top:12px">${rawRows.length} صف.</p>
        <table class="table"><thead><tr><th>عمود الملف</th><th>يقابله</th></tr></thead>
          <tbody>
            ${headers.map(h => `
              <tr><td>${esc(h)}</td><td>
                <select class="inline-input" data-map="${esc(h)}">
                  <option value="">تجاهل</option>
                  ${CANONICAL_FIELDS.map(f => `<option value="${f.key}" ${columnMap[h] === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
                </select>
              </td></tr>
            `).join('')}
          </tbody>
        </table>
        <button type="button" class="btn-save" id="saveDatasetBtn" style="margin-top:12px">حفظ البيانات</button>
      `;
      mapArea.querySelectorAll('[data-map]').forEach(sel => {
        sel.addEventListener('change', () => { columnMap[sel.dataset.map] = sel.value || null; });
      });
      $('#saveDatasetBtn').addEventListener('click', async () => {
        const btn = $('#saveDatasetBtn');
        btn.disabled = true;
        btn.textContent = 'جارٍ الحفظ...';
        try {
          const sb = getSupabase();
          const { canonicalRows } = applyColumnMap(rawRows, columnMap);
          const { data: { user } } = await sb.auth.getUser();
          if (editorState.dataset) {
            await sb.from('consulting_datasets').delete().eq('id', editorState.dataset.id);
          }
          await sb.from('consulting_datasets').insert([{
            deliverable_id: editorState.deliverable.id,
            source_type: 'upload',
            file_name: file.name,
            column_map: columnMap,
            rows: canonicalRows,
            row_count: canonicalRows.length,
            uploaded_by: user?.id || null
          }]);
          await logAudit('update', 'consulting_dataset', editorState.deliverable.id, null, { row_count: canonicalRows.length });
          openDeliverableEditor(editorState.deliverable.id);
        } catch (err) {
          alert('تعذر حفظ البيانات: ' + (err?.message || String(err)));
          btn.disabled = false;
          btn.textContent = 'حفظ البيانات';
        }
      });
    }
  });
}

/* ---------- Sections list (drag reorder + config) ---------- */

function renderSectionsList() {
  return editorState.sections.map(s => `
    <div class="section-row" draggable="true" data-section-id="${s.id}">
      <span class="section-row__drag">⋮⋮</span>
      <input type="checkbox" data-enabled="${s.id}" ${s.enabled ? 'checked' : ''}>
      <input type="text" class="inline-input section-row__title" data-title="${s.id}" value="${esc(s.title)}">
      <span class="section-row__kind">${s.kind === 'narrative' ? 'نصي' : s.kind === 'cover' ? 'غلاف' : 'بيانات'}</span>
      ${s.kind !== 'cover' ? `<button type="button" class="btn-back" data-toggle-config="${s.id}">إعدادات</button>` : ''}
      <div class="section-row__config" id="config-${s.id}" hidden>${renderSectionConfig(s)}</div>
    </div>
  `).join('');
}

function mappedFields() {
  const map = editorState.dataset?.column_map || {};
  return Array.from(new Set(Object.values(map).filter(Boolean)));
}

function renderSectionConfig(section) {
  const fields = mappedFields();
  if (section.kind === 'narrative') {
    const aiStatus = section.config?.ai_status;
    const badge = aiStatus === 'ai_generated'
      ? '<span class="badge badge--stage-won">تم التوليد بالذكاء الاصطناعي</span>'
      : aiStatus === 'edited'
        ? '<span class="badge badge--project-on_hold">معدَّل يدوياً بعد التوليد</span>'
        : '';
    return `
      <div class="ai-section-header">
        ${badge}
        <button type="button" class="btn-back" data-generate-ai="${section.id}">Automate</button>
      </div>
      <textarea class="inline-textarea" rows="3" data-config-body="${section.id}" placeholder="اكتب المحتوى هنا...">${esc(section.config?.body || '')}</textarea>
    `;
  }
  if (section.section_key === 'key_metrics') {
    return Object.entries(METRIC_PRESET_LABELS).map(([key, label]) => `
      <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;margin-bottom:4px">
        <input type="checkbox" data-metric="${section.id}" value="${key}" ${(section.config?.metrics || []).includes(key) ? 'checked' : ''}> ${esc(label)}
      </label>
    `).join('');
  }
  // Generic "data" section: chart type + group-by + aggregation, or filter controls.
  const cfg = section.config || {};
  const chartOptions = Object.entries(chartTypeLabels).map(([k, v]) => `<option value="${k}" ${cfg.chartType === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const fieldOptions = (extra = '') => `<option value="">—</option>${fields.map(f => `<option value="${f}" ${cfg.groupBy === f ? 'selected' : ''}>${esc(canonicalFieldLabels[f] || f)}</option>`).join('')}${extra}`;

  if ('filterField' in cfg) {
    const values = editorState.dataset ? distinctValues(editorState.dataset.rows, cfg.filterField || 'status') : [];
    return `
      <label>القيمة التي تمثل هذا القسم في عمود "${esc(canonicalFieldLabels[cfg.filterField] || cfg.filterField)}":</label>
      <select class="inline-input" data-filter-value="${section.id}">
        <option value="">— اختر —</option>
        ${values.map(v => `<option value="${esc(v)}" ${cfg.filterValue === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
    `;
  }

  return `
    <div class="config-row">
      <label>نوع الرسم</label><select class="inline-input" data-chart-type="${section.id}">${chartOptions}</select>
      <label>التجميع حسب</label><select class="inline-input" data-group-by="${section.id}">${fieldOptions()}</select>
      <label>دالة التجميع</label><select class="inline-input" data-aggregation="${section.id}">${Object.entries(aggregationLabels).map(([k, v]) => `<option value="${k}" ${cfg.aggregation === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
    </div>
  `;
}

function bindSectionsList() {
  const list = $('#sectionsList');

  list.querySelectorAll('[data-toggle-config]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = $(`#config-${btn.dataset.toggleConfig}`);
      el.hidden = !el.hidden;
    });
  });

  list.querySelectorAll('[data-generate-ai]').forEach(btn => {
    btn.addEventListener('click', () => generateInsightForSection(Number(btn.dataset.generateAi), btn));
  });

  list.querySelectorAll('[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', () => { draggedSectionId = Number(row.dataset.sectionId); row.classList.add('is-dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
    row.addEventListener('dragover', (e) => e.preventDefault());
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetId = Number(row.dataset.sectionId);
      if (draggedSectionId == null || draggedSectionId === targetId) return;
      const fromIdx = editorState.sections.findIndex(s => s.id === draggedSectionId);
      const toIdx = editorState.sections.findIndex(s => s.id === targetId);
      const [moved] = editorState.sections.splice(fromIdx, 1);
      editorState.sections.splice(toIdx, 0, moved);
      list.innerHTML = renderSectionsList();
      bindSectionsList();
    });
  });
}

async function generateInsightForSection(sectionId, btn) {
  const section = editorState.sections.find(s => s.id === sectionId);
  if (!section || !editorState.dataset) return;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Automating...';
  try {
    const body = await generateInsight(editorState.deliverable, section, editorState.dataset.rows);
    // Patch the existing textarea/badge in place instead of re-rendering the
    // section list — keeps every other row's DOM (and listeners) untouched.
    const textarea = $(`[data-config-body="${sectionId}"]`);
    if (textarea) textarea.value = body;
    const header = btn.closest('.ai-section-header');
    const badgeHtml = '<span class="badge badge--stage-won">تم التوليد بالذكاء الاصطناعي</span>';
    const existingBadge = header?.querySelector('.badge');
    if (existingBadge) existingBadge.outerHTML = badgeHtml;
    else header?.insertAdjacentHTML('afterbegin', badgeHtml);
  } catch (err) {
    alert('تعذر التوليد: ' + (err?.message || String(err)));
  }
  btn.disabled = false;
  btn.textContent = originalLabel;
}

function collectSectionUpdates() {
  const list = $('#sectionsList');
  return editorState.sections.map((s, i) => {
    const enabled = list.querySelector(`[data-enabled="${s.id}"]`).checked;
    const title = list.querySelector(`[data-title="${s.id}"]`).value.trim() || s.title;
    let config = s.config;

    const bodyEl = list.querySelector(`[data-config-body="${s.id}"]`);
    if (bodyEl) {
      const bodyChanged = bodyEl.value !== (config.body || '');
      config = { ...config, body: bodyEl.value };
      // Manual edits after an AI generation demote the status so the badge
      // no longer claims the visible text is still the unedited AI output.
      if (bodyChanged && config.ai_status === 'ai_generated') config = { ...config, ai_status: 'edited' };
    }

    const metricEls = list.querySelectorAll(`[data-metric="${s.id}"]`);
    if (metricEls.length) config = { ...config, metrics: Array.from(metricEls).filter(el => el.checked).map(el => el.value) };

    const filterEl = list.querySelector(`[data-filter-value="${s.id}"]`);
    if (filterEl) config = { ...config, filterValue: filterEl.value };

    const chartTypeEl = list.querySelector(`[data-chart-type="${s.id}"]`);
    if (chartTypeEl) config = { ...config, chartType: chartTypeEl.value };
    const groupByEl = list.querySelector(`[data-group-by="${s.id}"]`);
    if (groupByEl) config = { ...config, groupBy: groupByEl.value || null };
    const aggEl = list.querySelector(`[data-aggregation="${s.id}"]`);
    if (aggEl) config = { ...config, aggregation: aggEl.value };

    return { id: s.id, enabled, title, config, sort_order: i };
  });
}

async function saveSections() {
  const sb = getSupabase();
  const btn = $('#saveSectionsBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';
  try {
    const updates = collectSectionUpdates();
    for (const u of updates) {
      await sb.from('consulting_sections').update({
        enabled: u.enabled, title: u.title, config: u.config, sort_order: u.sort_order, updated_at: new Date().toISOString()
      }).eq('id', u.id);
    }
    await sb.from('consulting_deliverables').update({ updated_at: new Date().toISOString() }).eq('id', editorState.deliverable.id);
    await logAudit('update', 'consulting_deliverable', editorState.deliverable.id, null, { sections_updated: updates.length });
    openDeliverableEditor(editorState.deliverable.id);
  } catch (err) {
    alert('تعذر الحفظ: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'حفظ الترتيب والإعدادات';
  }
}

/* ---------- Preview ---------- */

const chartRegistry = {};

function showPreview() {
  const { deliverable, sections, dataset, clientName } = editorState;
  const { html, canvasJobs } = renderDeliverable(deliverable, sections, dataset.rows, clientName);
  setPrintContent(html);
  showPrintOverlay();
  // Charts need their <canvas> in the DOM first.
  setTimeout(() => instantiateCharts(canvasJobs, chartRegistry), 0);
}
