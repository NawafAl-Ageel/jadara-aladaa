import { $, esc, formatDate } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { state } from './state.js';
import { showPage } from './nav.js';
import { logAudit } from './audit.js';
import { logLeadActivity } from './lead-activities.js';
import { fetchClientActivities, logClientActivity, activityTypeLabel, LOGGABLE_ACTIVITY_TYPES } from './client-activities.js';
import { renderTimeline, renderComposer, bindComposer } from './activity-timeline.js';
import { mountAttachmentsWidget } from './attachments.js';
import { fetchActiveProfiles } from './team.js';
import { setModalContent, openModal, closeModal } from './modal.js';

export const clientStatusLabels = {
  prospect: 'محتمل',
  active: 'نشط',
  inactive: 'غير نشط',
  former_client: 'عميل سابق'
};

const PAGE_SIZE = 30;
const listState = { page: 0, totalCount: 0 };

/* ---------- Conversion (Phase 1, unchanged) ---------- */

export async function convertLeadToClient(lead) {
  if (lead.converted_to_client_id) {
    throw new Error('ALREADY_CONVERTED');
  }
  const sb = getSupabase();

  const { data: client, error } = await sb
    .from('clients')
    .insert([{
      name: lead.company || lead.name,
      source_lead_id: lead.id,
      status: 'prospect'
    }])
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('ALREADY_CONVERTED');
    throw error;
  }

  const { error: updateError } = await sb
    .from('leads')
    .update({ converted_to_client_id: client.id })
    .eq('id', lead.id);
  if (updateError) throw updateError;

  await logLeadActivity(lead.id, 'converted', 'تم تحويل العميل المحتمل إلى عميل', `تم إنشاء سجل عميل: ${client.name}`, { client_id: client.id });
  await logClientActivity(client.id, 'created', 'تم إنشاء العميل من عميل محتمل فائز');
  await logAudit('create', 'client', client.id, null, { source_lead_id: lead.id });

  return client;
}

/* ---------- List view ---------- */

export async function loadClients() {
  const sb = getSupabase();
  const search = $('#clientSearchInput').value.trim();
  const status = $('#clientStatusFilter').value;

  try {
    let q = sb.from('clients').select('*, profiles:account_owner(full_name, email)', { count: 'exact' }).is('deleted_at', null);
    if (status) q = q.eq('status', status);
    if (search) {
      const s = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.or(`name.ilike.%${s}%,industry.ilike.%${s}%`);
    }
    q = q.order('created_at', { ascending: false });
    const from = listState.page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data: clients, error, count } = await q;
    if (error) throw error;
    listState.totalCount = count || 0;
    renderClientsTable(clients || []);
    renderClientsPagination();

    const empty = $('#clientsEmptyState');
    const wrap = $('#clientsPage .table-wrap');
    if (!clients || clients.length === 0) { empty.style.display = 'block'; wrap.style.display = 'none'; }
    else { empty.style.display = 'none'; wrap.style.display = 'block'; }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('loadClients failed', err);
  }
}

function renderClientsTable(clients) {
  const tbody = $('#clientsBody');
  tbody.innerHTML = '';
  clients.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${listState.page * PAGE_SIZE + i + 1}</td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.industry || '—')}</td>
      <td><span class="badge badge--client-${esc(c.status)}">${esc(clientStatusLabels[c.status] || c.status)}</span></td>
      <td>${esc(c.profiles?.full_name || c.profiles?.email || '—')}</td>
      <td>${formatDate(c.created_at)}</td>
    `;
    tr.addEventListener('click', () => openClientDetail(c.id));
    tbody.appendChild(tr);
  });
}

function renderClientsPagination() {
  const totalPages = Math.max(1, Math.ceil(listState.totalCount / PAGE_SIZE));
  $('#clientsPageIndicator').textContent = `صفحة ${listState.page + 1} من ${totalPages} (${listState.totalCount} نتيجة)`;
  $('#clientsPrevPageBtn').disabled = listState.page === 0;
  $('#clientsNextPageBtn').disabled = listState.page + 1 >= totalPages;
}

/* ---------- Manual client creation ---------- */

function openAddClientModal() {
  setModalContent(`
    <h3>إضافة عميل</h3>
    <div class="field"><label>اسم العميل</label><input type="text" id="modalClientName" required></div>
    <div class="field"><label>الصناعة</label><input type="text" id="modalClientIndustry"></div>
    <div class="modal__actions">
      <button class="btn-back" id="modalCancel">إلغاء</button>
      <button class="btn-save" id="modalSave">إضافة</button>
    </div>
  `);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', async () => {
    const name = $('#modalClientName').value.trim();
    const industry = $('#modalClientIndustry').value.trim() || null;
    if (!name) return;
    try {
      const sb = getSupabase();
      const { data: client, error } = await sb.from('clients').insert([{ name, industry, status: 'prospect' }]).select('*').single();
      if (error) throw error;
      await logClientActivity(client.id, 'created', 'تم إنشاء العميل يدوياً');
      await logAudit('create', 'client', client.id, null, { name });
      closeModal();
      openClientDetail(client.id);
    } catch (err) {
      alert('تعذر إضافة العميل: ' + (err?.message || String(err)));
    }
  });
  openModal();
}

/* ---------- Detail view ---------- */

export async function openClientDetail(id) {
  showPage('clientDetailPage');
  $('#clientDetailContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const sb = getSupabase();
    const [{ data: client, error }, { data: contacts }, { data: projects }, activities, profiles] = await Promise.all([
      sb.from('clients').select('*').eq('id', id).single(),
      sb.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
      sb.from('projects').select('id, project_number, name, status, health, progress').eq('client_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      fetchClientActivities(id).catch(() => []),
      fetchActiveProfiles().catch(() => [])
    ]);
    if (error) throw error;
    renderClientDetail(client, contacts || [], projects || [], activities, profiles);
  } catch {
    $('#clientDetailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function renderContactsList(contacts) {
  if (!contacts.length) return '<p class="qa-empty">لا يوجد جهات اتصال بعد</p>';
  return contacts.map(c => `
    <div class="contact-row" data-contact-id="${c.id}">
      <div>
        <strong>${esc(c.name)}</strong>${c.is_primary ? ' <span class="badge badge--stage-won">أساسي</span>' : ''}
        <div class="attachment-row__meta">${esc(c.title || '')} ${c.email ? '· ' + esc(c.email) : ''} ${c.phone ? '· ' + esc(c.phone) : ''}</div>
      </div>
      <button type="button" class="btn-delete" data-delete-contact="${c.id}">حذف</button>
    </div>
  `).join('');
}

function renderProjectsList(projects) {
  if (!projects.length) return '<p class="qa-empty">لا توجد مشاريع بعد</p>';
  return projects.map(p => `
    <div class="checklist-row" data-open-project="${p.id}" style="cursor:pointer">
      <span class="checklist-row__title"><strong>${esc(p.project_number || '')}</strong> — ${esc(p.name)}</span>
      <span class="badge badge--project-${esc(p.status)}">${esc(p.status)}</span>
      <span class="badge badge--health-${esc(p.health)}">${esc(p.health)}</span>
    </div>
  `).join('');
}

function renderClientDetail(client, contacts, projects, activities, profiles) {
  const ownerOptions = profiles.map(p => `<option value="${p.id}" ${client.account_owner === p.id ? 'selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('');

  $('#clientDetailContent').innerHTML = `
    <div class="detail-main">
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>ملف العميل</h3>
          <span class="badge badge--client-${esc(client.status)}">${esc(clientStatusLabels[client.status] || client.status)}</span>
        </div>
        <div class="detail-card__body">
          <div class="detail-grid">
            <div class="field"><label>الاسم</label><input type="text" id="cName" value="${esc(client.name)}"></div>
            <div class="field"><label>الصناعة</label><input type="text" id="cIndustry" value="${esc(client.industry || '')}"></div>
            <div class="field"><label>حجم الشركة</label><input type="text" id="cSize" value="${esc(client.company_size || '')}"></div>
            <div class="field"><label>الموقع الإلكتروني</label><input type="text" id="cWebsite" value="${esc(client.website || '')}" dir="ltr"></div>
            <div class="field"><label>الدولة</label><input type="text" id="cCountry" value="${esc(client.country || '')}"></div>
            <div class="field"><label>المدينة</label><input type="text" id="cCity" value="${esc(client.city || '')}"></div>
            <div class="field"><label>الحالة</label>
              <select id="cStatus">
                ${Object.entries(clientStatusLabels).map(([k, v]) => `<option value="${k}" ${client.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>المسؤول عن الحساب</label><select id="cOwner"><option value="">—</option>${ownerOptions}</select></div>
            <div class="field detail-item--full"><label>الوسوم (مفصولة بفواصل)</label><input type="text" id="cTags" value="${esc((client.tags || []).join('، '))}"></div>
            <div class="field detail-item--full"><label>ملاحظات</label><textarea id="cNotes" rows="3">${esc(client.notes || '')}</textarea></div>
          </div>
          <button class="btn-save" id="cSaveBtn" style="margin-top:14px">حفظ التغييرات</button>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>جهات الاتصال</h3></div>
        <div class="detail-card__body">
          <form id="addContactForm" class="activity-form">
            <input type="text" id="contactName" placeholder="الاسم" required>
            <input type="text" id="contactTitle" placeholder="المسمى الوظيفي">
            <input type="email" id="contactEmail" placeholder="البريد الإلكتروني" dir="ltr">
            <input type="tel" id="contactPhone" placeholder="الهاتف" dir="ltr">
            <label style="font-size:0.8rem;display:flex;align-items:center;gap:6px"><input type="checkbox" id="contactPrimary"> جهة اتصال أساسية</label>
            <button type="submit" class="btn-save btn-save--sm">إضافة جهة اتصال</button>
          </form>
          <div class="contacts-list" id="contactsList">${renderContactsList(contacts)}</div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header">
          <h3>المشاريع</h3>
          <button class="btn-back" id="newProjectFromClientBtn">+ مشروع جديد</button>
        </div>
        <div class="detail-card__body">${renderProjectsList(projects)}</div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>سجل النشاط</h3></div>
        <div class="detail-card__body">
          <div id="clientActivityComposer">${renderComposer(LOGGABLE_ACTIVITY_TYPES, activityTypeLabel)}</div>
          <div class="activity-list" id="clientActivityList">${renderTimeline(activities, activityTypeLabel)}</div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>المستندات</h3></div>
        <div class="detail-card__body" id="clientAttachments"></div>
      </div>
    </div>

    <div class="detail-sidebar">
      <div class="sidebar-card">
        <h3>معلومات</h3>
        <div class="meta-row"><span class="detail-label">تاريخ الإنشاء</span><span class="detail-value">${formatDate(client.created_at)}</span></div>
        <div class="meta-row"><span class="detail-label">آخر تحديث</span><span class="detail-value">${formatDate(client.updated_at)}</span></div>
        ${client.source_lead_id ? `<div class="meta-row"><span class="detail-label">مصدر</span><span class="detail-value">عميل محتمل #${client.source_lead_id}</span></div>` : ''}
      </div>
    </div>
  `;

  $('#cSaveBtn').addEventListener('click', () => saveClient(client));
  $('#addContactForm').addEventListener('submit', (e) => addContact(e, client.id));
  document.querySelectorAll('[data-delete-contact]').forEach(btn => {
    btn.addEventListener('click', () => deleteContact(Number(btn.dataset.deleteContact), client.id));
  });
  document.querySelectorAll('[data-open-project]').forEach(row => {
    row.addEventListener('click', async () => {
      const { openProjectDetail } = await import('./projects.js');
      openProjectDetail(Number(row.dataset.openProject));
    });
  });
  $('#newProjectFromClientBtn').addEventListener('click', async () => {
    const { openAddProjectModal } = await import('./projects.js');
    openAddProjectModal(client.id);
  });

  bindComposer($('#clientActivityComposer').querySelector('[data-activity-composer]'), async (type, title, description) => {
    await logClientActivity(client.id, type, title, description);
    const fresh = await fetchClientActivities(client.id);
    $('#clientActivityList').innerHTML = renderTimeline(fresh, activityTypeLabel);
  });

  mountAttachmentsWidget($('#clientAttachments'), 'client', client.id);
}

async function saveClient(prevClient) {
  const sb = getSupabase();
  const btn = $('#cSaveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const updates = {
    name: $('#cName').value.trim(),
    industry: $('#cIndustry').value.trim() || null,
    company_size: $('#cSize').value.trim() || null,
    website: $('#cWebsite').value.trim() || null,
    country: $('#cCountry').value.trim() || null,
    city: $('#cCity').value.trim() || null,
    status: $('#cStatus').value,
    account_owner: $('#cOwner').value || null,
    tags: $('#cTags').value.split(/[,،]/).map(t => t.trim()).filter(Boolean),
    notes: $('#cNotes').value,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await sb.from('clients').update(updates).eq('id', prevClient.id);
    if (error) throw error;
    if (updates.status !== prevClient.status) {
      await logClientActivity(prevClient.id, 'status_changed', `تغيير الحالة إلى «${clientStatusLabels[updates.status] || updates.status}»`);
    }
    await logAudit('update', 'client', prevClient.id, { status: prevClient.status }, { status: updates.status });
    openClientDetail(prevClient.id);
  } catch (err) {
    alert('حدث خطأ أثناء الحفظ: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'حفظ التغييرات';
  }
}

async function addContact(e, clientId) {
  e.preventDefault();
  const name = $('#contactName').value.trim();
  if (!name) return;
  const sb = getSupabase();
  try {
    const { error } = await sb.from('client_contacts').insert([{
      client_id: clientId,
      name,
      title: $('#contactTitle').value.trim() || null,
      email: $('#contactEmail').value.trim() || null,
      phone: $('#contactPhone').value.trim() || null,
      is_primary: $('#contactPrimary').checked
    }]);
    if (error) throw error;
    openClientDetail(clientId);
  } catch (err) {
    alert('تعذر إضافة جهة الاتصال: ' + (err?.message || String(err)));
  }
}

async function deleteContact(contactId, clientId) {
  if (!confirm('حذف جهة الاتصال هذه؟')) return;
  const sb = getSupabase();
  try {
    const { error } = await sb.from('client_contacts').delete().eq('id', contactId);
    if (error) throw error;
    openClientDetail(clientId);
  } catch (err) {
    alert('تعذر الحذف: ' + (err?.message || String(err)));
  }
}

/* ---------- Event binding ---------- */

export function bindClientsEvents() {
  $('#clientSearchInput').addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => { listState.page = 0; loadClients(); }, 300);
  });
  $('#clientStatusFilter').addEventListener('change', () => { listState.page = 0; loadClients(); });
  $('#clientsPrevPageBtn').addEventListener('click', () => { if (listState.page > 0) { listState.page -= 1; loadClients(); } });
  $('#clientsNextPageBtn').addEventListener('click', () => { listState.page += 1; loadClients(); });
  $('#addClientBtn').addEventListener('click', openAddClientModal);
  $('#clientBackBtn').addEventListener('click', () => showPage('clientsPage'));
}
