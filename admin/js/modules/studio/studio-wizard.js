import { $, esc } from '../dom.js';
import { getSupabase } from '../supabase-client.js';
import { showPage } from '../nav.js';
import { logAudit } from '../audit.js';
import { CANONICAL_FIELDS, defaultSectionDefs } from './constants.js';
import { parseFile, suggestColumnMap, applyColumnMap } from './dataset-parser.js';
import { openDeliverableEditor } from './studio-editor.js';

const wizard = {
  step: 1,
  deliverableId: null,
  templateId: null,
  headers: [],
  rawRows: [],
  columnMap: {},
  canonicalRows: [],
  warnings: []
};

export async function openCreateWizard() {
  Object.assign(wizard, { step: 1, deliverableId: null, headers: [], rawRows: [], columnMap: {}, canonicalRows: [], warnings: [] });
  showPage('studioWizardPage');
  await renderStep1();
}

/* ---------- Step 1: deliverable info ---------- */

async function renderStep1() {
  const sb = getSupabase();
  const { data: clients } = await sb.from('clients').select('id,name').is('deleted_at', null).order('name').limit(500);

  $('#wizardStepIndicator').textContent = 'الخطوة ١ من ٣: معلومات التقرير';
  $('#wizardContent').innerHTML = `
    <div class="detail-card">
      <div class="detail-card__body">
        <div class="detail-grid">
          <div class="field"><label>اسم التقرير</label><input type="text" id="wzName" required placeholder="مثال: تحليل سوق خدمات النظافة"></div>
          <div class="field"><label>العميل (اختياري)</label>
            <select id="wzClient"><option value="">—</option>${(clients || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>اللغة</label>
            <select id="wzLanguage"><option value="ar" selected>العربية</option><option value="en">English</option></select>
          </div>
          <div class="field"><label>فترة التقرير</label><input type="text" id="wzPeriod" placeholder="مثال: الربع الثالث ٢٠٢٦"></div>
          <div class="field"><label>شعار العميل (رابط)</label><input type="text" id="wzLogo" dir="ltr" placeholder="https://..."></div>
          <div class="field"><label>اللون الأساسي للعلامة</label><input type="color" id="wzBrandColor" value="#1a5276"></div>
          <div class="field detail-item--full"><label>وصف داخلي (لا يظهر للعميل)</label><textarea id="wzDescription" rows="2"></textarea></div>
        </div>
      </div>
    </div>
  `;
  $('#wizardNextBtn').textContent = 'التالي: اختيار القالب';
  $('#wizardBackBtn').disabled = true;
}

async function submitStep1() {
  const name = $('#wzName').value.trim();
  if (!name) { alert('أدخل اسم التقرير'); return; }

  const sb = getSupabase();
  const btn = $('#wizardNextBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الإنشاء...';

  try {
    const { data: template } = await sb.from('consulting_templates').select('id').eq('key', 'market_analysis').single();
    wizard.templateId = template.id;

    const { data: { user } } = await sb.auth.getUser();
    const clientId = $('#wzClient').value ? Number($('#wzClient').value) : null;

    const { data: deliverable, error } = await sb.from('consulting_deliverables').insert([{
      client_id: clientId,
      template_id: wizard.templateId,
      name,
      internal_description: $('#wzDescription').value.trim() || null,
      language: $('#wzLanguage').value,
      reporting_period: $('#wzPeriod').value.trim() || null,
      logo_url: $('#wzLogo').value.trim() || null,
      brand_primary: $('#wzBrandColor').value,
      owner_id: user?.id || null
    }]).select('*').single();
    if (error) throw error;
    wizard.deliverableId = deliverable.id;

    const sectionRows = defaultSectionDefs().map((s, i) => ({
      deliverable_id: deliverable.id,
      section_key: s.key,
      kind: s.kind,
      title: s.title,
      description: s.description || null,
      enabled: true,
      sort_order: i,
      config: s.config
    }));
    await sb.from('consulting_sections').insert(sectionRows);

    await logAudit('create', 'consulting_deliverable', deliverable.id, null, { name });
    wizard.step = 2;
    await renderStep2();
  } catch (err) {
    alert('تعذر إنشاء التقرير: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'التالي: اختيار القالب';
  }
}

/* ---------- Step 2: template (single option for MVP) ---------- */

async function renderStep2() {
  $('#wizardStepIndicator').textContent = 'الخطوة ٢ من ٣: اختيار القالب';
  $('#wizardContent').innerHTML = `
    <div class="template-grid">
      <div class="template-card template-card--selected">
        <h3>تحليل السوق وخريطة الفرص</h3>
        <p>تحليل بيانات الفرص والمنافسين والجهات لأي قطاع، وعرضها في تقرير تفاعلي.</p>
      </div>
      <div class="template-card template-card--disabled"><h3>تحليل المنافسين</h3><p>قريباً</p></div>
      <div class="template-card template-card--disabled"><h3>التقييم الاستراتيجي</h3><p>قريباً</p></div>
      <div class="template-card template-card--disabled"><h3>التقييم التشغيلي</h3><p>قريباً</p></div>
      <div class="template-card template-card--disabled"><h3>لوحة الأداء</h3><p>قريباً</p></div>
      <div class="template-card template-card--disabled"><h3>خطة العمل</h3><p>قريباً</p></div>
    </div>
  `;
  $('#wizardNextBtn').textContent = 'التالي: رفع البيانات';
  $('#wizardBackBtn').disabled = false;
}

/* ---------- Step 3: data upload + column mapping ---------- */

async function renderStep3() {
  $('#wizardStepIndicator').textContent = 'الخطوة ٣ من ٣: البيانات';
  $('#wizardContent').innerHTML = `
    <div class="detail-card">
      <div class="detail-card__body">
        <p class="content-hint">ارفع ملف CSV أو Excel يحتوي على بيانات الفرص/المنافسين/الجهات. يمكن تحميل نموذج فارغ إذا كنت ستدخل البيانات يدوياً.</p>
        <input type="file" id="wzFileInput" accept=".csv,.xlsx,.xls">
        <button type="button" class="btn-back" id="wzDownloadTemplateBtn" style="margin-inline-start:10px">تنزيل نموذج فارغ</button>
        <div id="wzMappingArea"></div>
      </div>
    </div>
  `;
  $('#wizardNextBtn').textContent = 'حفظ والانتقال للتحرير';
  $('#wizardNextBtn').disabled = true;
  $('#wizardBackBtn').disabled = false;

  $('#wzDownloadTemplateBtn').addEventListener('click', downloadBlankTemplate);
  $('#wzFileInput').addEventListener('change', handleFileSelected);
}

function downloadBlankTemplate() {
  const headers = CANONICAL_FIELDS.map(f => f.label);
  const bom = String.fromCharCode(0xFEFF);
  const csv = bom + headers.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'نموذج-بيانات-فارغ.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleFileSelected() {
  const file = $('#wzFileInput').files[0];
  if (!file) return;
  const area = $('#wzMappingArea');
  area.innerHTML = '<p class="qa-empty">جارٍ التحليل...</p>';
  try {
    const { headers, rawRows } = await parseFile(file);
    wizard.headers = headers;
    wizard.rawRows = rawRows;
    wizard.columnMap = suggestColumnMap(headers);
    renderMappingTable();
    revalidate();
  } catch (err) {
    area.innerHTML = `<p style="color:#dc2626">${esc(err.message)}</p>`;
  }
}

function renderMappingTable() {
  const area = $('#wzMappingArea');
  area.innerHTML = `
    <p class="content-hint" style="margin-top:16px">تم العثور على ${wizard.rawRows.length} صف. طابق كل عمود من ملفك مع الحقل المناسب (أو اتركه "تجاهل").</p>
    <table class="table" id="wzMapTable">
      <thead><tr><th>عمود الملف</th><th>يقابله</th></tr></thead>
      <tbody>
        ${wizard.headers.map(h => `
          <tr>
            <td>${esc(h)}</td>
            <td>
              <select class="inline-input" data-map-header="${esc(h)}">
                <option value="">تجاهل</option>
                ${CANONICAL_FIELDS.map(f => `<option value="${f.key}" ${wizard.columnMap[h] === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
              </select>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="wzValidation"></div>
  `;
  area.querySelectorAll('[data-map-header]').forEach(sel => {
    sel.addEventListener('change', () => {
      wizard.columnMap[sel.dataset.mapHeader] = sel.value || null;
      revalidate();
    });
  });
}

function revalidate() {
  const { canonicalRows, warnings } = applyColumnMap(wizard.rawRows, wizard.columnMap);
  wizard.canonicalRows = canonicalRows;
  wizard.warnings = warnings;

  const hasAnyMapping = Object.values(wizard.columnMap).some(Boolean);
  const el = $('#wzValidation');
  if (el) {
    el.innerHTML = !hasAnyMapping
      ? '<p style="color:#dc2626">طابق عموداً واحداً على الأقل قبل المتابعة.</p>'
      : warnings.length
        ? `<p style="color:#92400e">${warnings.length} قيمة لم يمكن قراءتها بشكل صحيح (سيتم حفظها كفارغة) — الصفوف: ${warnings.slice(0, 10).map(w => w.row).join('، ')}${warnings.length > 10 ? '...' : ''}</p>`
        : '<p style="color:#166534">تم التحقق من البيانات بنجاح.</p>';
  }
  $('#wizardNextBtn').disabled = !hasAnyMapping;
}

async function submitStep3() {
  const sb = getSupabase();
  const btn = $('#wizardNextBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';
  try {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('consulting_datasets').insert([{
      deliverable_id: wizard.deliverableId,
      source_type: 'upload',
      file_name: $('#wzFileInput').files[0]?.name || null,
      column_map: wizard.columnMap,
      rows: wizard.canonicalRows,
      row_count: wizard.canonicalRows.length,
      uploaded_by: user?.id || null
    }]);
    if (error) throw error;
    await logAudit('create', 'consulting_dataset', wizard.deliverableId, null, { row_count: wizard.canonicalRows.length });
    openDeliverableEditor(wizard.deliverableId);
  } catch (err) {
    alert('تعذر حفظ البيانات: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'حفظ والانتقال للتحرير';
  }
}

/* ---------- Navigation ---------- */

export function bindWizardEvents() {
  $('#wizardBackBtn').addEventListener('click', async () => {
    if (wizard.step === 2) { wizard.step = 1; await renderStep1(); }
    else if (wizard.step === 3) { wizard.step = 2; await renderStep2(); }
  });
  $('#wizardNextBtn').addEventListener('click', async () => {
    if (wizard.step === 1) { await submitStep1(); }
    else if (wizard.step === 2) { wizard.step = 3; await renderStep3(); }
    else if (wizard.step === 3) { await submitStep3(); }
  });
  $('#wizardCancelBtn').addEventListener('click', () => showPage('studioPage'));
}
