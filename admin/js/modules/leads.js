import { $, $$, esc, formatDate } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { state } from './state.js';
import { salesStageLabels } from './pipeline.js';
import { openLeadDetail } from './lead-detail.js';
import { loadKanban, bindKanbanJumpButtons } from './lead-kanban.js';
import { logAudit } from './audit.js';

const PAGE_SIZE = 50;

const tableState = {
  page: 0,
  totalCount: 0,
  activeChip: null, // null | 'overdue' | 'today'
  selected: new Set(),
  currentPageLeadIds: []
};

let currentView = 'table';

/* ---------- View toggle (Table / Kanban) ---------- */

export function initLeadsViewToggle() {
  $('#viewTableBtn').addEventListener('click', () => switchView('table'));
  $('#viewKanbanBtn').addEventListener('click', () => switchView('kanban'));
}

function switchView(view) {
  currentView = view;
  $('#viewTableBtn').classList.toggle('is-active', view === 'table');
  $('#viewKanbanBtn').classList.toggle('is-active', view === 'kanban');
  $('#tableView').hidden = view !== 'table';
  $('#kanbanBoard').hidden = view !== 'kanban';
  $('#kanbanHint').hidden = view !== 'kanban';
  $('#bulkBar').hidden = view !== 'table' || tableState.selected.size === 0;
  loadLeadsPage();
}

// Registered as the listPage loader in main.js — dispatches to whichever
// view (table/Kanban) is currently active, so navigating away and back
// always refreshes the right one.
export function loadLeadsPage() {
  if (currentView === 'kanban') loadKanban();
  else loadLeads();
}

/* ---------- Table view ---------- */

export async function loadLeads() {
  if (currentView !== 'table') return;
  const sb = getSupabase();
  const search = $('#searchInput').value.trim();
  const stage = $('#statusFilter').value;
  const sort = $('#sortSelect').value;

  try {
    let q = sb
      .from('leads')
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    if (stage) q = q.eq('sales_stage', stage);
    if (search) {
      const s = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (tableState.activeChip === 'overdue') {
      q = q.lt('next_follow_up_date', today).not('sales_stage', 'in', '(won,lost)');
    } else if (tableState.activeChip === 'today') {
      q = q.eq('next_follow_up_date', today).not('sales_stage', 'in', '(won,lost)');
    }

    if (sort === 'created_asc') q = q.order('created_at', { ascending: true });
    else if (sort === 'follow_up_asc') q = q.order('next_follow_up_date', { ascending: true, nullsFirst: false });
    else if (sort === 'value_desc') q = q.order('estimated_value', { ascending: false, nullsFirst: false });
    else q = q.order('created_at', { ascending: false });

    const from = tableState.page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data: leads, error, count } = await q;
    if (error) throw error;

    tableState.totalCount = count || 0;
    tableState.currentPageLeadIds = (leads || []).map(l => l.id);
    renderTable(leads || []);
    renderPagination();

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
    const overdue = lead.next_follow_up_date && !['won', 'lost'].includes(lead.sales_stage) && lead.next_follow_up_date < new Date().toISOString().slice(0, 10);
    const dueToday = lead.next_follow_up_date === new Date().toISOString().slice(0, 10);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="row-select" data-id="${lead.id}" ${tableState.selected.has(lead.id) ? 'checked' : ''}></td>
      <td>${esc(lead.lead_number || lead.id)}</td>
      <td><strong>${esc(lead.name)}</strong></td>
      <td>${esc(lead.company || '—')}</td>
      <td>${esc(lead.service || '—')}</td>
      <td><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></td>
      <td dir="ltr">${esc(lead.phone)}</td>
      <td>${esc(lead.assigned_to || '—')}</td>
      <td><span class="badge badge--stage-${esc(lead.sales_stage)}">${esc(salesStageLabels[lead.sales_stage] || lead.sales_stage)}</span></td>
      <td>${lead.next_follow_up_date ? `<span class="due-badge ${overdue ? 'is-overdue' : ''} ${dueToday ? 'is-today' : ''}">${formatDate(lead.next_follow_up_date)}</span>` : '—'}</td>
      <td>${formatDate(lead.created_at)}</td>
    `;
    tr.querySelector('.row-select').addEventListener('click', (e) => e.stopPropagation());
    tr.querySelector('.row-select').addEventListener('change', (e) => toggleSelect(lead.id, e.target.checked));
    tr.addEventListener('click', () => openLeadDetail(lead.id));
    tbody.appendChild(tr);
  }

  $('#selectAllCheckbox').checked = leads.length > 0 && leads.every(l => tableState.selected.has(l.id));
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(tableState.totalCount / PAGE_SIZE));
  $('#pageIndicator').textContent = `صفحة ${tableState.page + 1} من ${totalPages} (${tableState.totalCount} نتيجة)`;
  $('#prevPageBtn').disabled = tableState.page === 0;
  $('#nextPageBtn').disabled = tableState.page + 1 >= totalPages;
}

/* ---------- Selection & bulk actions ---------- */

function toggleSelect(id, checked) {
  if (checked) tableState.selected.add(id);
  else tableState.selected.delete(id);
  updateBulkBar();
}

function updateBulkBar() {
  const count = tableState.selected.size;
  $('#bulkBar').hidden = count === 0;
  $('#bulkCount').textContent = `${count} محدد`;
}

function clearSelection() {
  tableState.selected.clear();
  $$('.row-select').forEach(cb => { cb.checked = false; });
  $('#selectAllCheckbox').checked = false;
  updateBulkBar();
}

async function bulkAssign() {
  const assignee = $('#bulkAssignee').value.trim();
  if (!assignee || tableState.selected.size === 0) return;
  const sb = getSupabase();
  const ids = Array.from(tableState.selected);
  const btn = $('#bulkAssignBtn');
  btn.disabled = true;
  try {
    const { error } = await sb.from('leads').update({ assigned_to: assignee, updated_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
    await sb.from('lead_activities').insert(ids.map(id => ({ lead_id: id, type: 'assigned', title: `تم الإسناد الجماعي إلى ${assignee}` })));
    await logAudit('bulk_update', 'lead', null, null, { ids, assigned_to: assignee });
    clearSelection();
    $('#bulkAssignee').value = '';
    loadLeads();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('bulkAssign failed', err);
    alert('تعذر تنفيذ الإسناد الجماعي: ' + (err?.message || String(err)));
  }
  btn.disabled = false;
}

async function bulkChangeStage() {
  const stage = $('#bulkStage').value;
  if (tableState.selected.size === 0) return;
  const sb = getSupabase();
  const ids = Array.from(tableState.selected);
  const btn = $('#bulkStageBtn');
  btn.disabled = true;
  try {
    const now = new Date().toISOString();
    const { error } = await sb.from('leads').update({ sales_stage: stage, last_interaction_date: now, updated_at: now }).in('id', ids);
    if (error) throw error;
    await sb.from('lead_activities').insert(ids.map(id => ({ lead_id: id, type: 'stage_changed', title: `تغيير جماعي للمرحلة إلى «${salesStageLabels[stage] || stage}»` })));
    await logAudit('bulk_update', 'lead', null, null, { ids, sales_stage: stage });
    clearSelection();
    loadLeads();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('bulkChangeStage failed', err);
    alert('تعذر تغيير المرحلة جماعياً: ' + (err?.message || String(err)));
  }
  btn.disabled = false;
}

/* ---------- Export ---------- */

export async function handleExport() {
  try {
    const sb = getSupabase();
    const stage = $('#statusFilter').value;
    let q = sb
      .from('leads')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (stage) q = q.eq('sales_stage', stage);
    const { data, error } = await q;
    if (error) throw error;

    let csv = '\uFEFF';
    csv += 'رقم العميل المحتمل,الاسم,المسمى الوظيفي,الشركة,الخدمة المطلوبة,البريد الإلكتروني,الهاتف,الرسالة,المسؤول,المرحلة,الأولوية,القيمة التقديرية,المصدر,تاريخ المتابعة القادمة,الوسوم,ملاحظات,تاريخ الإنشاء\n';
    for (const l of (data || [])) {
      const escCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      csv += [
        escCsv(l.lead_number),
        escCsv(l.name),
        escCsv(l.job_title),
        escCsv(l.company),
        escCsv(l.service),
        escCsv(l.email),
        escCsv(l.phone),
        escCsv(l.message),
        escCsv(l.assigned_to),
        salesStageLabels[l.sales_stage] || l.sales_stage,
        l.priority,
        l.estimated_value ?? '',
        l.source,
        l.next_follow_up_date ?? '',
        escCsv((l.tags || []).join('; ')),
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

/* ---------- Event binding (called once from main.js) ---------- */

export function bindLeadsEvents() {
  initLeadsViewToggle();
  bindKanbanJumpButtons();

  $('#searchInput').addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => { tableState.page = 0; loadLeads(); }, 300);
  });
  $('#statusFilter').addEventListener('change', () => { tableState.page = 0; loadLeads(); });
  $('#sortSelect').addEventListener('change', () => { tableState.page = 0; loadLeads(); });
  $('#exportBtn').addEventListener('click', handleExport);

  $('#prevPageBtn').addEventListener('click', () => { if (tableState.page > 0) { tableState.page -= 1; loadLeads(); } });
  $('#nextPageBtn').addEventListener('click', () => { tableState.page += 1; loadLeads(); });

  $('#chipOverdue').addEventListener('click', () => {
    tableState.activeChip = tableState.activeChip === 'overdue' ? null : 'overdue';
    $('#chipOverdue').classList.toggle('is-active', tableState.activeChip === 'overdue');
    $('#chipToday').classList.remove('is-active');
    tableState.page = 0;
    loadLeads();
  });
  $('#chipToday').addEventListener('click', () => {
    tableState.activeChip = tableState.activeChip === 'today' ? null : 'today';
    $('#chipToday').classList.toggle('is-active', tableState.activeChip === 'today');
    $('#chipOverdue').classList.remove('is-active');
    tableState.page = 0;
    loadLeads();
  });

  $('#selectAllCheckbox').addEventListener('change', (e) => {
    if (e.target.checked) tableState.currentPageLeadIds.forEach(id => tableState.selected.add(id));
    else tableState.currentPageLeadIds.forEach(id => tableState.selected.delete(id));
    $$('.row-select').forEach(cb => { cb.checked = e.target.checked; });
    updateBulkBar();
  });

  $('#bulkAssignBtn').addEventListener('click', bulkAssign);
  $('#bulkStageBtn').addEventListener('click', bulkChangeStage);
  $('#bulkClearBtn').addEventListener('click', clearSelection);
}
