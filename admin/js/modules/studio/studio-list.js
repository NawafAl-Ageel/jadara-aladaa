import { $, esc, formatDate } from '../dom.js';
import { getSupabase } from '../supabase-client.js';
import { state } from '../state.js';
import { logAudit } from '../audit.js';
import { openCreateWizard } from './studio-wizard.js';
import { openDeliverableEditor } from './studio-editor.js';

const statusLabels = {
  draft: 'مسودة', in_review: 'قيد المراجعة', approved: 'معتمد', published: 'منشور', archived: 'مؤرشف'
};

const PAGE_SIZE = 30;
const listState = { page: 0, totalCount: 0 };

export async function loadStudioList() {
  const sb = getSupabase();
  const search = $('#studioSearchInput').value.trim();
  const status = $('#studioStatusFilter').value;

  try {
    let q = sb.from('consulting_deliverables')
      .select('*, clients(name), consulting_templates(name_ar), profiles:owner_id(full_name,email)', { count: 'exact' })
      .is('deleted_at', null);
    if (status) q = q.eq('status', status);
    if (search) q = q.ilike('name', `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    q = q.order('updated_at', { ascending: false });
    const from = listState.page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data: rows, error, count } = await q;
    if (error) throw error;
    listState.totalCount = count || 0;
    renderTable(rows || []);
    renderPagination();

    const empty = $('#studioEmptyState');
    const wrap = $('#studioPage .table-wrap');
    if (!rows || rows.length === 0) { empty.style.display = 'block'; wrap.style.display = 'none'; }
    else { empty.style.display = 'none'; wrap.style.display = 'block'; }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('loadStudioList failed', err);
  }
}

function renderTable(rows) {
  const tbody = $('#studioBody');
  tbody.innerHTML = '';
  for (const d of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(d.name)}</strong></td>
      <td>${esc(d.clients?.name || '—')}</td>
      <td>${esc(d.consulting_templates?.name_ar || '—')}</td>
      <td><span class="badge badge--studio-${esc(d.status)}">${esc(statusLabels[d.status] || d.status)}</span></td>
      <td>${esc(d.profiles?.full_name || d.profiles?.email || '—')}</td>
      <td>${formatDate(d.updated_at)}</td>
      <td>
        <button type="button" class="btn-back" data-duplicate="${d.id}">تكرار</button>
        ${d.status === 'draft' ? `<button type="button" class="btn-delete" data-delete="${d.id}">حذف</button>` : ''}
      </td>
    `;
    tr.querySelector('td:first-child').addEventListener('click', () => openDeliverableEditor(d.id));
    tr.querySelector('td:first-child').style.cursor = 'pointer';
    tr.querySelector('[data-duplicate]')?.addEventListener('click', (e) => { e.stopPropagation(); duplicateDeliverable(d.id); });
    tr.querySelector('[data-delete]')?.addEventListener('click', (e) => { e.stopPropagation(); deleteDeliverable(d.id); });
    tbody.appendChild(tr);
  }
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(listState.totalCount / PAGE_SIZE));
  $('#studioPageIndicator').textContent = `صفحة ${listState.page + 1} من ${totalPages} (${listState.totalCount} نتيجة)`;
  $('#studioPrevPageBtn').disabled = listState.page === 0;
  $('#studioNextPageBtn').disabled = listState.page + 1 >= totalPages;
}

// Duplicates template/sections/branding — deliberately never copies the
// dataset (which may hold confidential client data) without the user
// explicitly choosing to, per the brief's requirement.
async function duplicateDeliverable(id) {
  if (!confirm('تكرار هذا التقرير كمسودة جديدة (بدون نسخ البيانات)؟')) return;
  const sb = getSupabase();
  try {
    const { data: original } = await sb.from('consulting_deliverables').select('*').eq('id', id).single();
    const { data: { user } } = await sb.auth.getUser();
    const { data: copy, error } = await sb.from('consulting_deliverables').insert([{
      client_id: original.client_id,
      template_id: original.template_id,
      name: original.name + ' (نسخة)',
      internal_description: original.internal_description,
      language: original.language,
      reporting_period: original.reporting_period,
      logo_url: original.logo_url,
      brand_primary: original.brand_primary,
      brand_secondary: original.brand_secondary,
      owner_id: user?.id || null
    }]).select('*').single();
    if (error) throw error;

    const { data: sections } = await sb.from('consulting_sections').select('*').eq('deliverable_id', id);
    if (sections?.length) {
      await sb.from('consulting_sections').insert(sections.map(s => ({
        deliverable_id: copy.id, section_key: s.section_key, kind: s.kind,
        title: s.title, description: s.description, enabled: s.enabled, sort_order: s.sort_order, config: s.config
      })));
    }

    await logAudit('create', 'consulting_deliverable', copy.id, null, { duplicated_from: id });
    openDeliverableEditor(copy.id);
  } catch (err) {
    alert('تعذر التكرار: ' + (err?.message || String(err)));
  }
}

async function deleteDeliverable(id) {
  if (!confirm('حذف هذه المسودة؟')) return;
  const sb = getSupabase();
  try {
    const { error } = await sb.from('consulting_deliverables').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await logAudit('delete', 'consulting_deliverable', id);
    loadStudioList();
  } catch (err) {
    alert('تعذر الحذف: ' + (err?.message || String(err)));
  }
}

export function bindStudioEvents() {
  $('#studioSearchInput').addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => { listState.page = 0; loadStudioList(); }, 300);
  });
  $('#studioStatusFilter').addEventListener('change', () => { listState.page = 0; loadStudioList(); });
  $('#studioPrevPageBtn').addEventListener('click', () => { if (listState.page > 0) { listState.page -= 1; loadStudioList(); } });
  $('#studioNextPageBtn').addEventListener('click', () => { listState.page += 1; loadStudioList(); });
  $('#newDeliverableBtn').addEventListener('click', () => openCreateWizard());
}
