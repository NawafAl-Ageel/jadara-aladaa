import { $, esc, formatDate } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { state } from './state.js';
import { showPage } from './nav.js';
import { logAudit } from './audit.js';
import { mountAttachmentsWidget } from './attachments.js';
import { fetchActiveProfiles } from './team.js';
import { setModalContent, openModal, closeModal } from './modal.js';

const statusLabels = { planning: 'تخطيط', active: 'نشط', on_hold: 'متوقف', completed: 'مكتمل', cancelled: 'ملغى' };
const healthLabels = { on_track: 'على المسار', at_risk: 'في خطر', delayed: 'متأخر' };
const milestoneStatusLabels = { upcoming: 'قادم', in_progress: 'قيد التنفيذ', done: 'منجز' };
const taskStatusLabels = { todo: 'لم يبدأ', in_progress: 'قيد التنفيذ', done: 'منجز' };
const deliverableStatusLabels = { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', delivered: 'تم التسليم' };

const PAGE_SIZE = 30;
const listState = { page: 0, totalCount: 0 };

/* ---------- List view ---------- */

export async function loadProjects() {
  const sb = getSupabase();
  const search = $('#projectSearchInput').value.trim();
  const status = $('#projectStatusFilter').value;

  try {
    let q = sb.from('projects').select('*, clients(name), profiles:manager_id(full_name,email)', { count: 'exact' }).is('deleted_at', null);
    if (status) q = q.eq('status', status);
    if (search) {
      const s = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.ilike('name', `%${s}%`);
    }
    q = q.order('created_at', { ascending: false });
    const from = listState.page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data: projects, error, count } = await q;
    if (error) throw error;
    listState.totalCount = count || 0;
    renderProjectsTable(projects || []);
    renderProjectsPagination();

    const empty = $('#projectsEmptyState');
    const wrap = $('#projectsPage .table-wrap');
    if (!projects || projects.length === 0) { empty.style.display = 'block'; wrap.style.display = 'none'; }
    else { empty.style.display = 'none'; wrap.style.display = 'block'; }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('loadProjects failed', err);
  }
}

function renderProjectsTable(projects) {
  const tbody = $('#projectsBody');
  tbody.innerHTML = '';
  for (const p of projects) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td dir="ltr">${esc(p.project_number || p.id)}</td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.clients?.name || '—')}</td>
      <td>${esc(p.profiles?.full_name || p.profiles?.email || '—')}</td>
      <td><span class="badge badge--project-${esc(p.status)}">${esc(statusLabels[p.status] || p.status)}</span></td>
      <td><span class="badge badge--health-${esc(p.health)}">${esc(healthLabels[p.health] || p.health)}</span></td>
      <td>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${Number(p.progress) || 0}%"></div></div>
      </td>
    `;
    tr.addEventListener('click', () => openProjectDetail(p.id));
    tbody.appendChild(tr);
  }
}

function renderProjectsPagination() {
  const totalPages = Math.max(1, Math.ceil(listState.totalCount / PAGE_SIZE));
  $('#projectsPageIndicator').textContent = `صفحة ${listState.page + 1} من ${totalPages} (${listState.totalCount} نتيجة)`;
  $('#projectsPrevPageBtn').disabled = listState.page === 0;
  $('#projectsNextPageBtn').disabled = listState.page + 1 >= totalPages;
}

/* ---------- Create ---------- */

export async function openAddProjectModal(preselectedClientId = null) {
  const sb = getSupabase();
  const { data: clients } = await sb.from('clients').select('id,name').is('deleted_at', null).order('name').limit(500);

  setModalContent(`
    <h3>مشروع جديد</h3>
    <div class="field"><label>العميل</label>
      <select id="modalProjectClient" required>
        <option value="">اختر عميلاً</option>
        ${(clients || []).map(c => `<option value="${c.id}" ${preselectedClientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>اسم المشروع</label><input type="text" id="modalProjectName" required></div>
    <div class="field"><label>الخدمة</label><input type="text" id="modalProjectService"></div>
    <div class="modal__actions">
      <button class="btn-back" id="modalCancel">إلغاء</button>
      <button class="btn-save" id="modalSave">إنشاء</button>
    </div>
  `);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', async () => {
    const clientId = Number($('#modalProjectClient').value);
    const name = $('#modalProjectName').value.trim();
    const service = $('#modalProjectService').value.trim() || null;
    if (!clientId || !name) return;
    try {
      const { data: project, error } = await sb.from('projects').insert([{ client_id: clientId, name, service }]).select('*').single();
      if (error) throw error;
      await logAudit('create', 'project', project.id, null, { client_id: clientId, name });
      closeModal();
      openProjectDetail(project.id);
    } catch (err) {
      alert('تعذر إنشاء المشروع: ' + (err?.message || String(err)));
    }
  });
  openModal();
}

/* ---------- Detail view ---------- */

export async function openProjectDetail(id) {
  showPage('projectDetailPage');
  $('#projectDetailContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const sb = getSupabase();
    const [{ data: project, error }, { data: milestones }, { data: tasks }, { data: deliverables }, { data: members }, profiles] = await Promise.all([
      sb.from('projects').select('*, clients(id,name)').eq('id', id).single(),
      sb.from('project_milestones').select('*').eq('project_id', id).order('sort_order'),
      sb.from('project_tasks').select('*, profiles:assignee_id(full_name,email)').eq('project_id', id).order('created_at'),
      sb.from('project_deliverable_items').select('*').eq('project_id', id).order('created_at'),
      sb.from('project_members').select('*, profiles:user_id(full_name,email)').eq('project_id', id),
      fetchActiveProfiles().catch(() => [])
    ]);
    if (error) throw error;
    renderProjectDetail(project, milestones || [], tasks || [], deliverables || [], members || [], profiles);
  } catch {
    $('#projectDetailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function renderChecklist(items, statusLabelsMap, kind) {
  if (!items.length) return '<p class="qa-empty">لا يوجد بعد</p>';
  return items.map(item => `
    <div class="checklist-row">
      <span class="checklist-row__title">${esc(item.title || item.name)}</span>
      ${item.due_date ? `<span class="detail-label">${formatDate(item.due_date)}</span>` : ''}
      <select data-${kind}-status="${item.id}">
        ${Object.entries(statusLabelsMap).map(([k, v]) => `<option value="${k}" ${item.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
      <button type="button" class="btn-delete" data-${kind}-delete="${item.id}">حذف</button>
    </div>
  `).join('');
}

function renderProjectDetail(project, milestones, tasks, deliverables, members, profiles) {
  const managerOptions = profiles.map(p => `<option value="${p.id}" ${project.manager_id === p.id ? 'selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('');
  const memberOptions = profiles.map(p => `<option value="${p.id}">${esc(p.full_name || p.email)}</option>`).join('');
  const assigneeOptions = profiles.map(p => `<option value="${p.id}">${esc(p.full_name || p.email)}</option>`).join('');

  $('#projectDetailContent').innerHTML = `
    <div class="detail-main">
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>${esc(project.name)}</h3>
          <span class="badge badge--project-${esc(project.status)}">${esc(statusLabels[project.status] || project.status)}</span>
        </div>
        <div class="detail-card__body">
          <div class="detail-grid">
            <div class="field"><label>اسم المشروع</label><input type="text" id="pName" value="${esc(project.name)}"></div>
            <div class="field"><label>الخدمة</label><input type="text" id="pService" value="${esc(project.service || '')}"></div>
            <div class="field"><label>مدير المشروع</label><select id="pManager"><option value="">—</option>${managerOptions}</select></div>
            <div class="field"><label>الحالة</label>
              <select id="pStatus">${Object.entries(statusLabels).map(([k, v]) => `<option value="${k}" ${project.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>الصحة</label>
              <select id="pHealth">${Object.entries(healthLabels).map(([k, v]) => `<option value="${k}" ${project.health === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>نسبة الإنجاز (%)</label><input type="number" id="pProgress" min="0" max="100" value="${project.progress}"></div>
            <div class="field"><label>تاريخ البدء</label><input type="date" id="pStart" value="${project.start_date || ''}"></div>
            <div class="field"><label>تاريخ الانتهاء المستهدف</label><input type="date" id="pTargetEnd" value="${project.target_end_date || ''}"></div>
            <div class="field detail-item--full"><label>النطاق</label><textarea id="pScope" rows="2">${esc(project.scope || '')}</textarea></div>
            <div class="field detail-item--full"><label>الوصف</label><textarea id="pDescription" rows="2">${esc(project.description || '')}</textarea></div>
          </div>
          <button class="btn-save" id="pSaveBtn" style="margin-top:14px">حفظ التغييرات</button>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>مراحل المشروع (Milestones)</h3></div>
        <div class="detail-card__body">
          <form id="addMilestoneForm" class="activity-form">
            <input type="text" id="milestoneTitle" placeholder="عنوان المرحلة" required>
            <input type="date" id="milestoneDue">
            <button type="submit" class="btn-save btn-save--sm">إضافة مرحلة</button>
          </form>
          <div id="milestonesList">${renderChecklist(milestones, milestoneStatusLabels, 'milestone')}</div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>المهام</h3></div>
        <div class="detail-card__body">
          <form id="addTaskForm" class="activity-form">
            <input type="text" id="taskTitle" placeholder="عنوان المهمة" required>
            <select id="taskAssignee"><option value="">بدون مسؤول</option>${assigneeOptions}</select>
            <input type="date" id="taskDue">
            <button type="submit" class="btn-save btn-save--sm">إضافة مهمة</button>
          </form>
          <div id="tasksList">${renderChecklist(tasks.map(t => ({ ...t, title: `${t.title}${t.profiles ? ' — ' + (t.profiles.full_name || t.profiles.email) : ''}` })), taskStatusLabels, 'task')}</div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>قائمة التسليمات</h3></div>
        <div class="detail-card__body">
          <form id="addDeliverableForm" class="activity-form">
            <input type="text" id="deliverableName" placeholder="اسم التسليم" required>
            <input type="date" id="deliverableDue">
            <button type="submit" class="btn-save btn-save--sm">إضافة تسليم</button>
          </form>
          <div id="deliverablesList">${renderChecklist(deliverables, deliverableStatusLabels, 'deliverable')}</div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>فريق المشروع</h3></div>
        <div class="detail-card__body">
          <form id="addMemberForm" class="activity-form">
            <select id="memberSelect">${memberOptions}</select>
            <input type="text" id="memberRole" placeholder="الدور في المشروع (مثال: استشاري رئيسي)">
            <button type="submit" class="btn-save btn-save--sm">إضافة للفريق</button>
          </form>
          <div id="membersList">
            ${members.length ? members.map(m => `
              <div class="checklist-row">
                <span class="checklist-row__title">${esc(m.profiles?.full_name || m.profiles?.email || '')} ${m.role_on_project ? '— ' + esc(m.role_on_project) : ''}</span>
                <button type="button" class="btn-delete" data-remove-member="${m.id}">إزالة</button>
              </div>
            `).join('') : '<p class="qa-empty">لا يوجد أعضاء بعد</p>'}
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>المستندات</h3></div>
        <div class="detail-card__body" id="projectAttachments"></div>
      </div>
    </div>

    <div class="detail-sidebar">
      <div class="sidebar-card">
        <h3>معلومات المشروع</h3>
        <div class="meta-row"><span class="detail-label">رقم المشروع</span><span class="detail-value" dir="ltr">${esc(project.project_number || '—')}</span></div>
        <div class="meta-row"><span class="detail-label">العميل</span><span class="detail-value">${esc(project.clients?.name || '—')}</span></div>
        <div class="meta-row"><span class="detail-label">تاريخ الإنشاء</span><span class="detail-value">${formatDate(project.created_at)}</span></div>
        <div class="meta-row"><span class="detail-label">آخر تحديث</span><span class="detail-value">${formatDate(project.updated_at)}</span></div>
      </div>
    </div>
  `;

  $('#pSaveBtn').addEventListener('click', () => saveProject(project));
  $('#addMilestoneForm').addEventListener('submit', (e) => addChecklistItem(e, 'project_milestones', project.id, {
    title: '#milestoneTitle', due_date: '#milestoneDue'
  }));
  $('#addTaskForm').addEventListener('submit', (e) => addChecklistItem(e, 'project_tasks', project.id, {
    title: '#taskTitle', assignee_id: '#taskAssignee', due_date: '#taskDue'
  }));
  $('#addDeliverableForm').addEventListener('submit', (e) => addChecklistItem(e, 'project_deliverable_items', project.id, {
    name: '#deliverableName', due_date: '#deliverableDue'
  }));
  $('#addMemberForm').addEventListener('submit', (e) => addMember(e, project.id));

  bindChecklistEvents('milestone', 'project_milestones', project.id);
  bindChecklistEvents('task', 'project_tasks', project.id);
  bindChecklistEvents('deliverable', 'project_deliverable_items', project.id);

  document.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const sb = getSupabase();
        const { error } = await sb.from('project_members').delete().eq('id', btn.dataset.removeMember);
        if (error) throw error;
        openProjectDetail(project.id);
      } catch (err) {
        alert('تعذر الإزالة: ' + (err?.message || String(err)));
      }
    });
  });

  mountAttachmentsWidget($('#projectAttachments'), 'project', project.id);
}

async function saveProject(prevProject) {
  const sb = getSupabase();
  const btn = $('#pSaveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const updates = {
    name: $('#pName').value.trim(),
    service: $('#pService').value.trim() || null,
    manager_id: $('#pManager').value || null,
    status: $('#pStatus').value,
    health: $('#pHealth').value,
    progress: Math.max(0, Math.min(100, Number($('#pProgress').value) || 0)),
    start_date: $('#pStart').value || null,
    target_end_date: $('#pTargetEnd').value || null,
    scope: $('#pScope').value,
    description: $('#pDescription').value,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await sb.from('projects').update(updates).eq('id', prevProject.id);
    if (error) throw error;
    await logAudit('update', 'project', prevProject.id,
      { status: prevProject.status, health: prevProject.health, progress: prevProject.progress },
      { status: updates.status, health: updates.health, progress: updates.progress });
    openProjectDetail(prevProject.id);
  } catch (err) {
    alert('حدث خطأ أثناء الحفظ: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'حفظ التغييرات';
  }
}

async function addChecklistItem(e, table, projectId, fieldMap) {
  e.preventDefault();
  const sb = getSupabase();
  const row = { project_id: projectId };
  for (const [col, sel] of Object.entries(fieldMap)) {
    const el = $(sel);
    const val = el.value.trim ? el.value.trim() : el.value;
    if (val) row[col] = val;
  }
  if (!row.title && !row.name) return;
  try {
    const { error } = await sb.from(table).insert([row]);
    if (error) throw error;
    openProjectDetail(projectId);
  } catch (err) {
    alert('تعذر الإضافة: ' + (err?.message || String(err)));
  }
}

function bindChecklistEvents(kind, table, projectId) {
  document.querySelectorAll(`[data-${kind}-status]`).forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        const sb = getSupabase();
        const { error } = await sb.from(table).update({ status: sel.value }).eq('id', sel.dataset[`${kind}Status`]);
        if (error) throw error;
      } catch (err) {
        alert('تعذر التحديث: ' + (err?.message || String(err)));
      }
    });
  });
  document.querySelectorAll(`[data-${kind}-delete]`).forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا العنصر؟')) return;
      try {
        const sb = getSupabase();
        const { error } = await sb.from(table).delete().eq('id', btn.dataset[`${kind}Delete`]);
        if (error) throw error;
        openProjectDetail(projectId);
      } catch (err) {
        alert('تعذر الحذف: ' + (err?.message || String(err)));
      }
    });
  });
}

async function addMember(e, projectId) {
  e.preventDefault();
  const sb = getSupabase();
  const userId = $('#memberSelect').value;
  const role = $('#memberRole').value.trim() || null;
  if (!userId) return;
  try {
    const { error } = await sb.from('project_members').insert([{ project_id: projectId, user_id: userId, role_on_project: role }]);
    if (error) throw error;
    openProjectDetail(projectId);
  } catch (err) {
    alert('تعذر الإضافة: ' + (err?.message || String(err)));
  }
}

/* ---------- Event binding ---------- */

export function bindProjectsEvents() {
  $('#projectSearchInput').addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => { listState.page = 0; loadProjects(); }, 300);
  });
  $('#projectStatusFilter').addEventListener('change', () => { listState.page = 0; loadProjects(); });
  $('#projectsPrevPageBtn').addEventListener('click', () => { if (listState.page > 0) { listState.page -= 1; loadProjects(); } });
  $('#projectsNextPageBtn').addEventListener('click', () => { listState.page += 1; loadProjects(); });
  $('#addProjectBtn').addEventListener('click', () => openAddProjectModal());
  $('#projectBackBtn').addEventListener('click', () => showPage('projectsPage'));
}
