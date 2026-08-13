import { $ } from './dom.js';
import { esc, formatDate, copyToClipboard } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { statusLabels } from './constants.js';
import { showPage } from './nav.js';
import { logAudit } from './audit.js';

export async function loadLeads() {
  const sb = getSupabase();
  const search = $('#searchInput').value.trim();
  const status = $('#statusFilter').value;

  try {
    let q = sb
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (status) q = q.eq('status', status);
    if (search) {
      const s = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    const { data: leads, error } = await q;
    if (error) throw error;
    renderTable(leads || []);
    const empty = $('#emptyState');
    const wrap = $('#listPage .table-wrap');
    if (!leads || leads.length === 0) {
      empty.style.display = 'block';
      wrap.style.display = 'none';
    } else {
      empty.style.display = 'none';
      wrap.style.display = 'block';
    }
  } catch { /* silent */ }
}

function renderTable(leads) {
  const tbody = $('#leadsBody');
  tbody.innerHTML = '';

  for (const lead of leads) {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => openLeadDetail(lead.id));
    tr.innerHTML = `
      <td>${lead.id}</td>
      <td><strong>${esc(lead.name)}</strong></td>
      <td>${esc(lead.job_title || '—')}</td>
      <td>${esc(lead.company || '—')}</td>
      <td>${esc(lead.service || '—')}</td>
      <td><a href="mailto:${esc(lead.email)}" onclick="event.stopPropagation()">${esc(lead.email)}</a></td>
      <td dir="ltr">${esc(lead.phone)}</td>
      <td>${esc(lead.assigned_to || '—')}</td>
      <td><span class="badge badge--${lead.status}">${statusLabels[lead.status] || lead.status}</span></td>
      <td>${formatDate(lead.created_at)}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function openLeadDetail(id) {
  showPage('detailPage');
  $('#detailContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const sb = getSupabase();
    const { data: lead, error } = await sb.from('leads').select('*').eq('id', id).single();
    if (error) throw error;
    renderDetail(lead);
  } catch {
    $('#detailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function renderActivity(activity) {
  if (!Array.isArray(activity) || activity.length === 0) {
    return '<p class="qa-empty">لا يوجد سجل تغييرات بعد</p>';
  }
  return activity.slice().reverse().map(a => `
    <div class="activity-item">
      <span class="activity-item__dot"></span>
      <div>
        <p class="activity-item__text">${esc(a.text)}</p>
        <span class="activity-item__date">${formatDate(a.at)}</span>
      </div>
    </div>
  `).join('');
}

function renderDetail(lead) {
  $('#detailContent').innerHTML = `
    <div class="detail-main">
      <!-- Contact Info Card -->
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>معلومات التواصل</h3>
          <span class="badge badge--${lead.status}">${statusLabels[lead.status] || lead.status}</span>
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
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="11" height="11" rx="2"></rect>
                    <path d="M5 15V6a2 2 0 0 1 2-2h9"></path>
                  </svg>
                </button>
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الهاتف</span>
              <span class="detail-value detail-value-row">
                <a href="tel:${esc(lead.phone)}" class="phone-link" dir="ltr">${esc(lead.phone)}</a>
                <button type="button" class="copy-btn" data-copy="${esc(lead.phone)}" data-label="الهاتف" aria-label="نسخ رقم الهاتف" title="نسخ">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="11" height="11" rx="2"></rect>
                    <path d="M5 15V6a2 2 0 0 1 2-2h9"></path>
                  </svg>
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
          <div class="activity-list">${renderActivity(lead.activity)}</div>
        </div>
      </div>
    </div>

    <!-- Sidebar -->
    <div class="detail-sidebar">
      <div class="sidebar-card">
        <h3>معلومات الطلب</h3>
        <div class="meta-row">
          <span class="detail-label">رقم الطلب</span>
          <span class="detail-value">#${lead.id}</span>
        </div>
        <div class="meta-row">
          <span class="detail-label">تاريخ الإنشاء</span>
          <span class="detail-value">${formatDate(lead.created_at)}</span>
        </div>
        <div class="meta-row">
          <span class="detail-label">آخر تحديث</span>
          <span class="detail-value">${formatDate(lead.updated_at)}</span>
        </div>
      </div>

      <div class="sidebar-card">
        <h3>إدارة الطلب</h3>
        <div class="field">
          <label>الحالة</label>
          <select id="detailStatus">
            <option value="new" ${lead.status === 'new' ? 'selected' : ''}>جديد</option>
            <option value="in_review" ${lead.status === 'in_review' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>تم التواصل</option>
            <option value="closed" ${lead.status === 'closed' ? 'selected' : ''}>مغلق</option>
          </select>
        </div>
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
        <button class="btn-delete" id="deleteBtn">حذف هذا الطلب</button>
      </div>
    </div>
  `;

  $('#saveBtn').addEventListener('click', () => saveLead(lead));
  $('#deleteBtn').addEventListener('click', () => deleteLead(lead.id));
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

async function saveLead(prevLead) {
  const sb = getSupabase();
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const newStatus = $('#detailStatus').value;
  const newAssignee = $('#detailAssignee').value.trim();
  const newNotes = $('#detailNotes').value;

  const activity = Array.isArray(prevLead.activity) ? prevLead.activity.slice() : [];
  const now = new Date().toISOString();
  if (newStatus !== prevLead.status) {
    activity.push({ at: now, text: `تغيير الحالة إلى «${statusLabels[newStatus] || newStatus}»` });
  }
  if (newAssignee !== (prevLead.assigned_to || '')) {
    activity.push({ at: now, text: newAssignee ? `تم إسناد الطلب إلى ${newAssignee}` : 'تمت إزالة المسؤول عن المتابعة' });
  }
  if (newNotes !== (prevLead.notes || '')) {
    activity.push({ at: now, text: 'تم تحديث الملاحظات' });
  }

  try {
    const { data: updated, error } = await sb
      .from('leads')
      .update({
        status: newStatus,
        assigned_to: newAssignee || null,
        notes: newNotes,
        activity,
        updated_at: now
      })
      .eq('id', prevLead.id)
      .select('*')
      .single();
    if (error) throw error;
    await logAudit('update', 'lead', prevLead.id,
      { status: prevLead.status, assigned_to: prevLead.assigned_to, notes: prevLead.notes },
      { status: newStatus, assigned_to: newAssignee || null, notes: newNotes });
    renderDetail(updated);
  } catch {
    alert('حدث خطأ أثناء الحفظ');
  }

  btn.disabled = false;
  btn.textContent = 'حفظ التغييرات';
}

async function deleteLead(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;

  try {
    const sb = getSupabase();
    const { error } = await sb.from('leads').delete().eq('id', id);
    if (error) throw error;
    await logAudit('delete', 'lead', id);
    showPage('listPage');
    await loadLeads();
  } catch {
    alert('تعذر الحذف');
  }
}

export async function handleExport() {
  try {
    const sb = getSupabase();
    const status = $('#statusFilter').value;
    let q = sb
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    let csv = '\uFEFF';
    csv += 'ID,الاسم,المسمى الوظيفي,الشركة,الخدمة المطلوبة,البريد الإلكتروني,الهاتف,الرسالة,المسؤول,الحالة,ملاحظات,تاريخ الإنشاء\n';
    for (const l of (data || [])) {
      const escCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      csv += [
        l.id,
        escCsv(l.name),
        escCsv(l.job_title),
        escCsv(l.company),
        escCsv(l.service),
        escCsv(l.email),
        escCsv(l.phone),
        escCsv(l.message),
        escCsv(l.assigned_to),
        l.status,
        escCsv(l.notes),
        l.created_at
      ].join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jadara-leads.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    alert('تعذر التصدير');
  }
}
