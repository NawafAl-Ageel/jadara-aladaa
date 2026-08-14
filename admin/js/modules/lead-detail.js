import { $, esc, formatDate, copyToClipboard } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { showPage } from './nav.js';
import { logAudit } from './audit.js';
import { SALES_STAGES, salesStageLabels, priorityLabels, sourceLabels } from './pipeline.js';
import { fetchLeadActivities, logLeadActivity, activityTypeLabel, LOGGABLE_ACTIVITY_TYPES } from './lead-activities.js';
import { convertLeadToClient } from './clients.js';

export async function openLeadDetail(id) {
  showPage('detailPage');
  $('#detailContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const sb = getSupabase();
    const { data: lead, error } = await sb.from('leads').select('*').eq('id', id).single();
    if (error) throw error;
    let client = null;
    if (lead.converted_to_client_id) {
      const { data: c } = await sb.from('clients').select('id,name').eq('id', lead.converted_to_client_id).single();
      client = c || null;
    }
    const activities = await fetchLeadActivities(id).catch(() => []);
    renderDetail(lead, client, activities);
  } catch {
    $('#detailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function legacyActivityHtml(activity) {
  if (!Array.isArray(activity) || activity.length === 0) return '';
  return `
    <div class="detail-card">
      <div class="detail-card__header"><h3>سجل قديم (قبل هذا التحديث)</h3></div>
      <div class="detail-card__body">
        <div class="activity-list">
          ${activity.slice().reverse().map(a => `
            <div class="activity-item">
              <span class="activity-item__dot"></span>
              <div>
                <p class="activity-item__text">${esc(a.text)}</p>
                <span class="activity-item__date">${formatDate(a.at)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function timelineHtml(activities) {
  if (!activities.length) return '<p class="qa-empty">لا يوجد نشاط بعد</p>';
  return activities.map(a => `
    <div class="activity-item">
      <span class="activity-item__dot activity-item__dot--${esc(a.type)}"></span>
      <div>
        <p class="activity-item__text"><strong>${esc(activityTypeLabel(a.type))}</strong> — ${esc(a.title)}</p>
        ${a.description ? `<p class="activity-item__desc">${esc(a.description)}</p>` : ''}
        <span class="activity-item__date">${esc(a.profiles?.full_name || a.profiles?.email || 'النظام')} · ${formatDate(a.created_at)}</span>
      </div>
    </div>
  `).join('');
}

function renderDetail(lead, client, activities) {
  const isLost = lead.sales_stage === 'lost';
  const alreadyConverted = !!lead.converted_to_client_id;

  $('#detailContent').innerHTML = `
    <div class="detail-main">
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>معلومات التواصل</h3>
          <span class="badge badge--stage-${esc(lead.sales_stage)}">${esc(salesStageLabels[lead.sales_stage] || lead.sales_stage)}</span>
        </div>
        <div class="detail-card__body">
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">الاسم</span>
              <span class="detail-value">${esc(lead.name)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">المسمى الوظيفي</span>
              <span class="detail-value">${esc(lead.job_title || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الشركة</span>
              <span class="detail-value">${esc(lead.company || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الخدمة المطلوبة</span>
              <span class="detail-value">${esc(lead.service || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">البريد الإلكتروني</span>
              <span class="detail-value detail-value-row">
                <a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>
                <button type="button" class="copy-btn" data-copy="${esc(lead.email)}" data-label="البريد الإلكتروني" aria-label="نسخ البريد الإلكتروني" title="نسخ">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>
                </button>
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الهاتف</span>
              <span class="detail-value detail-value-row">
                <a href="tel:${esc(lead.phone)}" class="phone-link" dir="ltr">${esc(lead.phone)}</a>
                <button type="button" class="copy-btn" data-copy="${esc(lead.phone)}" data-label="الهاتف" aria-label="نسخ رقم الهاتف" title="نسخ">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>
                </button>
              </span>
            </div>
            <div class="detail-item detail-item--full">
              <span class="detail-label">الرسالة</span>
              <span class="detail-value">${esc(lead.message)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>سجل النشاط</h3></div>
        <div class="detail-card__body">
          <form id="activityForm" class="activity-form">
            <select id="activityType">
              ${LOGGABLE_ACTIVITY_TYPES.map(t => `<option value="${t}">${esc(activityTypeLabel(t))}</option>`).join('')}
            </select>
            <input type="text" id="activityTitle" placeholder="عنوان مختصر (مثال: تم الاتصال بالعميل)" required>
            <textarea id="activityDesc" placeholder="تفاصيل إضافية (اختياري)" rows="2"></textarea>
            <button type="submit" class="btn-save btn-save--sm">إضافة للسجل</button>
          </form>
          <div class="activity-list" id="activityList">${timelineHtml(activities)}</div>
        </div>
      </div>

      ${legacyActivityHtml(lead.activity)}
    </div>

    <!-- Sidebar -->
    <div class="detail-sidebar">
      <div class="sidebar-card">
        <h3>معلومات الطلب</h3>
        <div class="meta-row">
          <span class="detail-label">رقم العميل المحتمل</span>
          <span class="detail-value" dir="ltr">${esc(lead.lead_number || '—')}</span>
        </div>
        <div class="meta-row">
          <span class="detail-label">تاريخ الإنشاء</span>
          <span class="detail-value">${formatDate(lead.created_at)}</span>
        </div>
        <div class="meta-row">
          <span class="detail-label">آخر تحديث</span>
          <span class="detail-value">${formatDate(lead.updated_at)}</span>
        </div>
        <div class="meta-row">
          <span class="detail-label">آخر تفاعل</span>
          <span class="detail-value">${formatDate(lead.last_interaction_date)}</span>
        </div>
      </div>

      <div class="sidebar-card">
        <h3>مسار المبيعات</h3>
        <div class="field">
          <label>مرحلة المسار</label>
          <select id="detailStage">
            ${SALES_STAGES.map(s => `<option value="${s.key}" ${lead.sales_stage === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="lostReasonField" style="${isLost ? '' : 'display:none'}">
          <label>سبب الخسارة</label>
          <textarea id="detailLostReason" rows="2" placeholder="لماذا لم نفز بهذا العميل المحتمل؟">${esc(lead.lost_reason || '')}</textarea>
        </div>
        <div class="field">
          <label>الأولوية</label>
          <select id="detailPriority">
            ${Object.entries(priorityLabels).map(([k, v]) => `<option value="${k}" ${lead.priority === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>القيمة التقديرية (ريال سعودي)</label>
          <input type="number" id="detailValue" min="0" step="0.01" value="${lead.estimated_value ?? ''}">
        </div>
        <div class="field">
          <label>تاريخ المتابعة القادمة</label>
          <input type="date" id="detailFollowUp" value="${lead.next_follow_up_date || ''}">
        </div>
        <div class="field">
          <label>مصدر العميل المحتمل</label>
          <select id="detailSource">
            ${Object.entries(sourceLabels).map(([k, v]) => `<option value="${k}" ${lead.source === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>الوسوم (مفصولة بفواصل)</label>
          <input type="text" id="detailTags" value="${esc((lead.tags || []).join('، '))}" placeholder="مثال: قطاع حكومي، أولوية">
        </div>
      </div>

      <div class="sidebar-card">
        <h3>إدارة الطلب</h3>
        <div class="field">
          <label>المسؤول عن المتابعة</label>
          <input type="text" id="detailAssignee" placeholder="اسم أو بريد الموظف" value="${esc(lead.assigned_to || '')}">
        </div>
        <div class="field">
          <label>ملاحظات</label>
          <textarea id="detailNotes" placeholder="أضف ملاحظاتك هنا..." rows="4">${esc(lead.notes || '')}</textarea>
        </div>
        <button class="btn-save" id="saveBtn">حفظ التغييرات</button>
      </div>

      <div class="sidebar-card">
        <h3>التحويل</h3>
        ${alreadyConverted
          ? `<p class="content-hint">تم التحويل إلى عميل: <strong>${esc(client?.name || '')}</strong></p>`
          : `<button class="btn-back" id="convertClientBtn" style="width:100%">تحويل إلى عميل</button>`
        }
        <button class="btn-back" id="convertProjectBtn" style="width:100%;margin-top:8px">تحويل إلى مشروع</button>
      </div>

      <div class="sidebar-card">
        <button class="btn-delete" id="deleteBtn">حذف هذا الطلب</button>
      </div>
    </div>
  `;

  $('#detailStage').addEventListener('change', (e) => {
    $('#lostReasonField').style.display = e.target.value === 'lost' ? '' : 'none';
  });

  $('#saveBtn').addEventListener('click', () => saveLead(lead));
  $('#deleteBtn').addEventListener('click', () => deleteLead(lead.id));
  $('#activityForm').addEventListener('submit', (e) => addActivity(e, lead.id));

  $('#convertClientBtn')?.addEventListener('click', () => handleConvertToClient(lead));
  $('#convertProjectBtn').addEventListener('click', () => {
    alert('تحويل العميل المحتمل إلى مشروع سيتوفر في المرحلة القادمة (العملاء والمشاريع).');
  });

  document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = btn.getAttribute('data-copy') || '';
      const label = btn.getAttribute('data-label') || 'القيمة';
      const ok = await copyToClipboard(text);
      btn.classList.toggle('is-copied', ok);
      setTimeout(() => { btn.classList.remove('is-copied'); }, 420);
      if (!ok) alert(`تعذر نسخ ${label}`);
    });
  });
}

async function addActivity(e, leadId) {
  e.preventDefault();
  const type = $('#activityType').value;
  const title = $('#activityTitle').value.trim();
  const description = $('#activityDesc').value.trim() || null;
  if (!title) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await logLeadActivity(leadId, type, title, description);
    const sb = getSupabase();
    await sb.from('leads').update({ last_interaction_date: new Date().toISOString() }).eq('id', leadId);
    const activities = await fetchLeadActivities(leadId);
    $('#activityList').innerHTML = timelineHtml(activities);
    $('#activityForm').reset();
  } catch {
    alert('تعذر إضافة النشاط');
  }
  btn.disabled = false;
}

async function saveLead(prevLead) {
  const sb = getSupabase();
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const newStage = $('#detailStage').value;
  const newPriority = $('#detailPriority').value;
  const newValue = $('#detailValue').value ? Number($('#detailValue').value) : null;
  const newFollowUp = $('#detailFollowUp').value || null;
  const newSource = $('#detailSource').value;
  const newTags = $('#detailTags').value.split(/[,،]/).map(t => t.trim()).filter(Boolean);
  const newLostReason = newStage === 'lost' ? ($('#detailLostReason').value.trim() || null) : null;
  const newAssignee = $('#detailAssignee').value.trim();
  const newNotes = $('#detailNotes').value;
  const now = new Date().toISOString();

  try {
    const { data: updated, error } = await sb
      .from('leads')
      .update({
        sales_stage: newStage,
        priority: newPriority,
        estimated_value: newValue,
        next_follow_up_date: newFollowUp,
        source: newSource,
        tags: newTags,
        lost_reason: newLostReason,
        assigned_to: newAssignee || null,
        notes: newNotes,
        last_interaction_date: now,
        updated_at: now
      })
      .eq('id', prevLead.id)
      .select('*')
      .single();
    if (error) throw error;

    if (newStage !== prevLead.sales_stage) {
      await logLeadActivity(prevLead.id, 'stage_changed', `تغيير المرحلة إلى «${salesStageLabels[newStage] || newStage}»`);
    }
    if (newAssignee !== (prevLead.assigned_to || '')) {
      await logLeadActivity(prevLead.id, 'assigned', newAssignee ? `تم الإسناد إلى ${newAssignee}` : 'تمت إزالة المسؤول');
    }
    await logAudit('update', 'lead', prevLead.id,
      { sales_stage: prevLead.sales_stage, assigned_to: prevLead.assigned_to },
      { sales_stage: newStage, assigned_to: newAssignee || null });

    const activities = await fetchLeadActivities(prevLead.id);
    let client = null;
    if (updated.converted_to_client_id) {
      const { data: c } = await sb.from('clients').select('id,name').eq('id', updated.converted_to_client_id).single();
      client = c || null;
    }
    renderDetail(updated, client, activities);
  } catch {
    alert('حدث خطأ أثناء الحفظ');
    btn.disabled = false;
    btn.textContent = 'حفظ التغييرات';
  }
}

async function handleConvertToClient(lead) {
  if (!confirm(`تحويل «${lead.company || lead.name}» إلى عميل؟`)) return;
  const btn = $('#convertClientBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ التحويل...';
  try {
    await convertLeadToClient(lead);
    alert('تم التحويل بنجاح');
    openLeadDetail(lead.id);
  } catch (err) {
    if (err?.message === 'ALREADY_CONVERTED') {
      alert('تم تحويل هذا العميل المحتمل مسبقاً');
      openLeadDetail(lead.id);
    } else {
      alert('تعذر التحويل');
      btn.disabled = false;
      btn.textContent = 'تحويل إلى عميل';
    }
  }
}

async function deleteLead(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الطلب؟ يمكن استرجاعه لاحقاً من قاعدة البيانات عند الحاجة.')) return;

  try {
    const sb = getSupabase();
    const { error } = await sb.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await logAudit('delete', 'lead', id);
    showPage('listPage');
  } catch {
    alert('تعذر الحذف');
  }
}
