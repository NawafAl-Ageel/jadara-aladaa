import { $, esc, formatDate } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { state } from './state.js';
import { showPage } from './nav.js';
import { logAudit } from './audit.js';
import { logLeadActivity } from './lead-activities.js';
import { logClientActivity } from './client-activities.js';
import { convertLeadToClient } from './clients.js';
import { setModalContent, openModal, closeModal } from './modal.js';
import { openProposalPrint } from './proposal-print.js';

export const statusLabels = {
  draft: 'مسودة',
  internal_review: 'مراجعة داخلية',
  sent: 'مُرسل',
  viewed: 'تمت المشاهدة',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  expired: 'منتهي'
};

const PAGE_SIZE = 30;
const listState = { page: 0, totalCount: 0 };
let itemRows = []; // working line items for the currently open proposal editor

function currency(n) {
  return (Number(n) || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeTotals(items, discountType, discountValue, vatRate) {
  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const discountAmount = discountType === 'percentage'
    ? subtotal * (Number(discountValue) || 0) / 100
    : Math.min(Number(discountValue) || 0, subtotal);
  const taxable = Math.max(0, subtotal - discountAmount);
  const vatAmount = taxable * (Number(vatRate) || 0) / 100;
  const total = taxable + vatAmount;
  return { subtotal, discountAmount, vatAmount, total };
}

/* ---------- List view ---------- */

export async function loadProposals() {
  const sb = getSupabase();
  const search = $('#proposalSearchInput').value.trim();
  const status = $('#proposalStatusFilter').value;

  try {
    let q = sb.from('proposals')
      .select('*, leads(name, company), clients(name)', { count: 'exact' })
      .eq('is_current', true);
    if (status) q = q.eq('status', status);
    if (search) {
      const s = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.ilike('project_title', `%${s}%`);
    }
    q = q.order('created_at', { ascending: false });
    const from = listState.page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data: proposals, error, count } = await q;
    if (error) throw error;
    listState.totalCount = count || 0;
    renderProposalsTable(proposals || []);
    renderProposalsPagination();

    const empty = $('#proposalsEmptyState');
    const wrap = $('#proposalsPage .table-wrap');
    if (!proposals || proposals.length === 0) { empty.style.display = 'block'; wrap.style.display = 'none'; }
    else { empty.style.display = 'none'; wrap.style.display = 'block'; }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('loadProposals failed', err);
  }
}

function renderProposalsTable(proposals) {
  const tbody = $('#proposalsBody');
  tbody.innerHTML = '';
  for (const p of proposals) {
    const targetName = p.clients?.name || p.leads?.company || p.leads?.name || '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td dir="ltr">${esc(p.proposal_number || p.id)}</td>
      <td><strong>${esc(p.project_title)}</strong></td>
      <td>${esc(targetName)}</td>
      <td><span class="badge badge--proposal-${esc(p.status)}">${esc(statusLabels[p.status] || p.status)}</span></td>
      <td>${currency(p.total)} ﷼</td>
      <td>${formatDate(p.created_at)}</td>
    `;
    tr.addEventListener('click', () => openProposalDetail(p.id));
    tbody.appendChild(tr);
  }
}

function renderProposalsPagination() {
  const totalPages = Math.max(1, Math.ceil(listState.totalCount / PAGE_SIZE));
  $('#proposalsPageIndicator').textContent = `صفحة ${listState.page + 1} من ${totalPages} (${listState.totalCount} نتيجة)`;
  $('#proposalsPrevPageBtn').disabled = listState.page === 0;
  $('#proposalsNextPageBtn').disabled = listState.page + 1 >= totalPages;
}

/* ---------- Create ---------- */

export async function openAddProposalModal(preselectedLeadId = null, preselectedClientId = null) {
  const sb = getSupabase();
  const [{ data: leads }, { data: clients }] = await Promise.all([
    sb.from('leads').select('id,name,company').is('deleted_at', null).order('created_at', { ascending: false }).limit(300),
    sb.from('clients').select('id,name').is('deleted_at', null).order('name').limit(500)
  ]);

  setModalContent(`
    <h3>عرض جديد</h3>
    <div class="field"><label>العميل المحتمل (اختياري إذا تم اختيار عميل)</label>
      <select id="modalProposalLead">
        <option value="">—</option>
        ${(leads || []).map(l => `<option value="${l.id}" ${preselectedLeadId === l.id ? 'selected' : ''}>${esc(l.company || l.name)} — ${esc(l.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>العميل (اختياري إذا تم اختيار عميل محتمل)</label>
      <select id="modalProposalClient">
        <option value="">—</option>
        ${(clients || []).map(c => `<option value="${c.id}" ${preselectedClientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>عنوان المشروع</label><input type="text" id="modalProposalTitle" required></div>
    <div class="modal__actions">
      <button class="btn-back" id="modalCancel">إلغاء</button>
      <button class="btn-save" id="modalSave">إنشاء</button>
    </div>
  `);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', async () => {
    const leadId = $('#modalProposalLead').value ? Number($('#modalProposalLead').value) : null;
    const clientId = $('#modalProposalClient').value ? Number($('#modalProposalClient').value) : null;
    const title = $('#modalProposalTitle').value.trim();
    if (!leadId && !clientId) { alert('اختر عميلاً محتملاً أو عميلاً'); return; }
    if (!title) return;
    try {
      const { data: proposal, error } = await sb.from('proposals').insert([{
        lead_id: leadId, client_id: clientId, project_title: title
      }]).select('*').single();
      if (error) throw error;
      await logAudit('create', 'proposal', proposal.id, null, { lead_id: leadId, client_id: clientId, title });
      if (leadId) await logLeadActivity(leadId, 'proposal_created', `تم إنشاء عرض: ${title}`);
      if (clientId) await logClientActivity(clientId, 'proposal_created', `تم إنشاء عرض: ${title}`);
      closeModal();
      openProposalDetail(proposal.id);
    } catch (err) {
      alert('تعذر إنشاء العرض: ' + (err?.message || String(err)));
    }
  });
  openModal();
}

/* ---------- Detail / editor ---------- */

export async function openProposalDetail(id) {
  showPage('proposalDetailPage');
  $('#proposalDetailContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const sb = getSupabase();
    const [{ data: proposal, error }, { data: items }] = await Promise.all([
      sb.from('proposals').select('*, leads(id,name,company), clients(id,name)').eq('id', id).single(),
      sb.from('proposal_items').select('*').eq('proposal_id', id).order('sort_order')
    ]);
    if (error) throw error;
    itemRows = (items || []).map(i => ({ ...i }));
    renderProposalDetail(proposal);
  } catch {
    $('#proposalDetailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function renderItemsTable() {
  return `
    <table class="table" id="itemsTable">
      <thead><tr><th>الخدمة/البند</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th></tr></thead>
      <tbody>
        ${itemRows.map((it, i) => `
          <tr data-item-index="${i}">
            <td><input type="text" class="inline-input" data-item-field="service_key" value="${esc(it.service_key)}"></td>
            <td><input type="text" class="inline-input" data-item-field="description" value="${esc(it.description || '')}"></td>
            <td><input type="number" class="inline-input" min="0" step="0.01" data-item-field="quantity" value="${it.quantity}" style="width:70px"></td>
            <td><input type="number" class="inline-input" min="0" step="0.01" data-item-field="unit_price" value="${it.unit_price}" style="width:100px"></td>
            <td data-line-total>${currency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
            <td><button type="button" class="btn-delete" data-remove-item="${i}">حذف</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button type="button" class="btn-back" id="addItemRowBtn" style="margin-top:10px">+ إضافة بند</button>
  `;
}

// The discount/VAT <select>/<input> controls are rendered once and never
// replaced afterward — refreshTotals() only patches the computed <strong>
// display values. Rebuilding the controls' HTML on every keystroke (as an
// earlier version did) would destroy and recreate the very input the user
// is typing into, kicking focus out after each character.
function renderTotalsBlock(proposal) {
  const { subtotal, discountAmount, vatAmount, total } = computeTotals(itemRows, proposal.discount_type, proposal.discount_value, proposal.vat_rate);
  return `
    <div class="totals-block">
      <div class="totals-row"><span>الإجمالي الفرعي</span><strong data-total-subtotal>${currency(subtotal)} ﷼</strong></div>
      <div class="totals-row">
        <span>الخصم</span>
        <span class="totals-row__controls">
          <select id="discountType">
            <option value="fixed" ${proposal.discount_type === 'fixed' ? 'selected' : ''}>مبلغ ثابت</option>
            <option value="percentage" ${proposal.discount_type === 'percentage' ? 'selected' : ''}>نسبة %</option>
          </select>
          <input type="number" id="discountValue" min="0" step="0.01" value="${proposal.discount_value}" style="width:90px">
        </span>
        <strong data-total-discount>-${currency(discountAmount)} ﷼</strong>
      </div>
      <div class="totals-row">
        <span>ضريبة القيمة المضافة</span>
        <span class="totals-row__controls"><input type="number" id="vatRate" min="0" step="0.01" value="${proposal.vat_rate}" style="width:70px">%</span>
        <strong data-total-vat>${currency(vatAmount)} ﷼</strong>
      </div>
      <div class="totals-row totals-row--total"><span>الإجمالي</span><strong data-total-grand>${currency(total)} ﷼</strong></div>
    </div>
  `;
}

function refreshTotals(proposal) {
  const { subtotal, discountAmount, vatAmount, total } = computeTotals(itemRows, proposal.discount_type, proposal.discount_value, proposal.vat_rate);
  $('[data-total-subtotal]').textContent = `${currency(subtotal)} ﷼`;
  $('[data-total-discount]').textContent = `-${currency(discountAmount)} ﷼`;
  $('[data-total-vat]').textContent = `${currency(vatAmount)} ﷼`;
  $('[data-total-grand]').textContent = `${currency(total)} ﷼`;
}

function bindTotalsInputs(proposal) {
  ['discountType', 'discountValue', 'vatRate'].forEach(id => {
    $(`#${id}`).addEventListener('input', () => {
      proposal.discount_type = $('#discountType').value;
      proposal.discount_value = $('#discountValue').value;
      proposal.vat_rate = $('#vatRate').value;
      refreshTotals(proposal);
    });
  });
}

function rebuildItemsTable(proposal) {
  $('#itemsTableWrap').innerHTML = renderItemsTable();
  bindItemsTable(proposal);
  refreshTotals(proposal);
}

function bindItemsTable(proposal) {
  // Text/number edits patch the row in place — rebuilding the table's
  // outerHTML here would destroy and recreate the focused <input> on every
  // keystroke, kicking focus out after each character typed.
  document.querySelectorAll('[data-item-field]').forEach(input => {
    input.addEventListener('input', () => {
      const tr = input.closest('[data-item-index]');
      const idx = Number(tr.dataset.itemIndex);
      itemRows[idx][input.dataset.itemField] = input.value;
      const lineTotal = (Number(itemRows[idx].quantity) || 0) * (Number(itemRows[idx].unit_price) || 0);
      tr.querySelector('[data-line-total]').textContent = currency(lineTotal);
      refreshTotals(proposal);
    });
  });
  // Add/remove genuinely change row count, so a full rebuild here is fine —
  // no input is mid-edit when a button is clicked.
  document.querySelectorAll('[data-remove-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      itemRows.splice(Number(btn.dataset.removeItem), 1);
      rebuildItemsTable(proposal);
    });
  });
  $('#addItemRowBtn').addEventListener('click', () => {
    itemRows.push({ service_key: '', description: '', quantity: 1, unit_price: 0, sort_order: itemRows.length });
    rebuildItemsTable(proposal);
  });
}

function renderProposalDetail(proposal) {
  const targetName = proposal.clients?.name || proposal.leads?.company || proposal.leads?.name || '—';
  const canAccept = !['accepted', 'rejected', 'expired'].includes(proposal.status);

  $('#proposalDetailContent').innerHTML = `
    <div class="detail-main">
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>${esc(proposal.project_title)}</h3>
          <span class="badge badge--proposal-${esc(proposal.status)}">${esc(statusLabels[proposal.status] || proposal.status)}</span>
        </div>
        <div class="detail-card__body">
          <div class="detail-grid">
            <div class="field"><label>عنوان المشروع</label><input type="text" id="prTitle" value="${esc(proposal.project_title)}"></div>
            <div class="field"><label>تاريخ الانتهاء</label><input type="date" id="prExpires" value="${proposal.expires_at || ''}"></div>
            <div class="field detail-item--full"><label>النطاق</label><textarea id="prScope" rows="2">${esc(proposal.scope || '')}</textarea></div>
            <div class="field detail-item--full"><label>التسليمات</label><textarea id="prDeliverables" rows="2">${esc(proposal.deliverables || '')}</textarea></div>
            <div class="field detail-item--full"><label>الجدول الزمني</label><input type="text" id="prTimeline" value="${esc(proposal.timeline || '')}"></div>
            <div class="field detail-item--full"><label>الشروط والأحكام</label><textarea id="prTerms" rows="3">${esc(proposal.terms || '')}</textarea></div>
            <div class="field detail-item--full"><label>ملاحظات داخلية</label><textarea id="prNotes" rows="2">${esc(proposal.internal_notes || '')}</textarea></div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-card__header"><h3>البنود والأسعار</h3></div>
        <div class="detail-card__body">
          <div class="table-wrap" id="itemsTableWrap">${renderItemsTable()}</div>
          <div id="totalsBlock">${renderTotalsBlock(proposal)}</div>
          <button class="btn-save" id="prSaveBtn" style="margin-top:14px">حفظ التغييرات</button>
        </div>
      </div>
    </div>

    <div class="detail-sidebar">
      <div class="sidebar-card">
        <h3>معلومات العرض</h3>
        <div class="meta-row"><span class="detail-label">رقم العرض</span><span class="detail-value" dir="ltr">${esc(proposal.proposal_number || '—')}</span></div>
        <div class="meta-row"><span class="detail-label">الجهة</span><span class="detail-value">${esc(targetName)}</span></div>
        <div class="meta-row"><span class="detail-label">الإصدار</span><span class="detail-value">${proposal.version}</span></div>
        <div class="meta-row"><span class="detail-label">تاريخ الإنشاء</span><span class="detail-value">${formatDate(proposal.created_at)}</span></div>
        ${proposal.sent_at ? `<div class="meta-row"><span class="detail-label">تاريخ الإرسال</span><span class="detail-value">${formatDate(proposal.sent_at)}</span></div>` : ''}
        ${proposal.accepted_at ? `<div class="meta-row"><span class="detail-label">تاريخ القبول</span><span class="detail-value">${formatDate(proposal.accepted_at)}</span></div>` : ''}
      </div>

      <div class="sidebar-card">
        <h3>الإجراءات</h3>
        <button class="btn-back" id="printBtn" style="width:100%">معاينة / طباعة PDF</button>
        <button class="btn-back" id="duplicateBtn" style="width:100%;margin-top:8px">تكرار كعرض جديد</button>
        ${proposal.status === 'draft' || proposal.status === 'internal_review'
          ? `<button class="btn-save" id="markSentBtn" style="width:100%;margin-top:8px">تحديد كمُرسل</button>` : ''}
        ${canAccept ? `
          <button class="btn-save" id="acceptBtn" style="width:100%;margin-top:8px;background:#166534">قبول العرض وإنشاء مشروع</button>
          <button class="btn-delete" id="rejectBtn" style="width:100%;margin-top:8px">رفض العرض</button>
        ` : ''}
        ${proposal.project_id ? `<p class="content-hint" style="margin-top:8px">تم إنشاء مشروع من هذا العرض.</p>` : ''}
      </div>
    </div>
  `;

  bindItemsTable(proposal);
  bindTotalsInputs(proposal);

  $('#prSaveBtn').addEventListener('click', () => saveProposal(proposal));
  $('#printBtn').addEventListener('click', () => openProposalPrint(proposal, itemRows, computeTotals(itemRows, proposal.discount_type, proposal.discount_value, proposal.vat_rate)));
  $('#duplicateBtn').addEventListener('click', () => duplicateProposal(proposal));
  $('#markSentBtn')?.addEventListener('click', () => markSent(proposal));
  $('#acceptBtn')?.addEventListener('click', () => acceptProposal(proposal));
  $('#rejectBtn')?.addEventListener('click', () => rejectProposal(proposal));
}

async function saveProposal(prevProposal) {
  const sb = getSupabase();
  const btn = $('#prSaveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const discountType = $('#discountType').value;
  const discountValue = Number($('#discountValue').value) || 0;
  const vatRate = Number($('#vatRate').value) || 0;
  const { subtotal, discountAmount, vatAmount, total } = computeTotals(itemRows, discountType, discountValue, vatRate);

  try {
    const { error: upErr } = await sb.from('proposals').update({
      project_title: $('#prTitle').value.trim(),
      scope: $('#prScope').value,
      deliverables: $('#prDeliverables').value,
      timeline: $('#prTimeline').value,
      terms: $('#prTerms').value,
      internal_notes: $('#prNotes').value,
      expires_at: $('#prExpires').value || null,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      subtotal,
      total,
      updated_at: new Date().toISOString()
    }).eq('id', prevProposal.id);
    if (upErr) throw upErr;

    await sb.from('proposal_items').delete().eq('proposal_id', prevProposal.id);
    const rowsToInsert = itemRows
      .filter(it => it.service_key && it.service_key.trim())
      .map((it, i) => ({
        proposal_id: prevProposal.id,
        service_key: it.service_key.trim(),
        description: it.description || null,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        line_total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        sort_order: i
      }));
    if (rowsToInsert.length) {
      const { error: itemsErr } = await sb.from('proposal_items').insert(rowsToInsert);
      if (itemsErr) throw itemsErr;
    }

    await logAudit('update', 'proposal', prevProposal.id, { total: prevProposal.total }, { total });
    openProposalDetail(prevProposal.id);
  } catch (err) {
    alert('تعذر الحفظ: ' + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = 'حفظ التغييرات';
  }
}

async function markSent(proposal) {
  const sb = getSupabase();
  try {
    const now = new Date().toISOString();
    const { error } = await sb.from('proposals').update({ status: 'sent', sent_at: now, updated_at: now }).eq('id', proposal.id);
    if (error) throw error;
    if (proposal.lead_id) await logLeadActivity(proposal.lead_id, 'proposal_sent', `تم إرسال العرض: ${proposal.project_title}`);
    if (proposal.client_id) await logClientActivity(proposal.client_id, 'proposal_sent', `تم إرسال العرض: ${proposal.project_title}`);
    await logAudit('update', 'proposal', proposal.id, { status: proposal.status }, { status: 'sent' });
    openProposalDetail(proposal.id);
  } catch (err) {
    alert('تعذر التحديث: ' + (err?.message || String(err)));
  }
}

async function rejectProposal(proposal) {
  if (!confirm('تحديد هذا العرض كمرفوض؟')) return;
  const sb = getSupabase();
  try {
    const { error } = await sb.from('proposals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', proposal.id);
    if (error) throw error;
    await logAudit('update', 'proposal', proposal.id, { status: proposal.status }, { status: 'rejected' });
    openProposalDetail(proposal.id);
  } catch (err) {
    alert('تعذر التحديث: ' + (err?.message || String(err)));
  }
}

async function acceptProposal(proposal) {
  if (proposal.project_id) { alert('تم إنشاء مشروع من هذا العرض مسبقاً'); return; }
  if (!confirm(`قبول عرض «${proposal.project_title}» وإنشاء مشروع؟`)) return;

  const btn = $('#acceptBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الإنشاء...';

  try {
    const sb = getSupabase();
    let clientId = proposal.client_id;
    if (!clientId && proposal.lead_id) {
      const { data: lead } = await sb.from('leads').select('*').eq('id', proposal.lead_id).single();
      if (lead.converted_to_client_id) {
        clientId = lead.converted_to_client_id;
      } else {
        const client = await convertLeadToClient(lead);
        clientId = client.id;
      }
    }
    if (!clientId) throw new Error('تعذر تحديد العميل المرتبط بهذا العرض');

    const { data: project, error } = await sb.from('projects').insert([{
      client_id: clientId,
      name: proposal.project_title,
      scope: proposal.scope,
      description: proposal.deliverables,
      source_proposal_id: proposal.id
    }]).select('*').single();
    if (error) {
      if (error.code === '23505') throw new Error('ALREADY_CONVERTED');
      throw error;
    }

    const now = new Date().toISOString();
    await sb.from('proposals').update({ status: 'accepted', accepted_at: now, project_id: project.id, updated_at: now }).eq('id', proposal.id);

    if (proposal.lead_id) await logLeadActivity(proposal.lead_id, 'converted', 'تم قبول العرض وإنشاء مشروع', `المشروع: ${project.name}`, { project_id: project.id });
    await logClientActivity(clientId, 'project_created', `تم قبول العرض وإنشاء مشروع: ${project.name}`);
    await logAudit('create', 'project', project.id, null, { source_proposal_id: proposal.id, client_id: clientId });

    const { openProjectDetail } = await import('./projects.js');
    openProjectDetail(project.id);
  } catch (err) {
    if (err?.message === 'ALREADY_CONVERTED') {
      alert('تم إنشاء مشروع من هذا العرض مسبقاً');
      openProposalDetail(proposal.id);
    } else {
      alert('تعذر إتمام القبول: ' + (err?.message || String(err)));
      btn.disabled = false;
      btn.textContent = 'قبول العرض وإنشاء مشروع';
    }
  }
}

async function duplicateProposal(proposal) {
  if (!confirm('إنشاء نسخة جديدة من هذا العرض كمسودة مستقلة؟')) return;
  const sb = getSupabase();
  try {
    const { data: newProposal, error } = await sb.from('proposals').insert([{
      lead_id: proposal.lead_id,
      client_id: proposal.client_id,
      project_title: proposal.project_title + ' (نسخة)',
      scope: proposal.scope,
      deliverables: proposal.deliverables,
      timeline: proposal.timeline,
      terms: proposal.terms,
      discount_type: proposal.discount_type,
      discount_value: proposal.discount_value,
      vat_rate: proposal.vat_rate
    }]).select('*').single();
    if (error) throw error;

    if (itemRows.length) {
      const rows = itemRows.filter(it => it.service_key?.trim()).map((it, i) => ({
        proposal_id: newProposal.id,
        service_key: it.service_key.trim(),
        description: it.description || null,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        line_total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        sort_order: i
      }));
      if (rows.length) await sb.from('proposal_items').insert(rows);
    }

    await logAudit('create', 'proposal', newProposal.id, null, { duplicated_from: proposal.id });
    openProposalDetail(newProposal.id);
  } catch (err) {
    alert('تعذر التكرار: ' + (err?.message || String(err)));
  }
}

/* ---------- Event binding ---------- */

export function bindProposalsEvents() {
  $('#proposalSearchInput').addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => { listState.page = 0; loadProposals(); }, 300);
  });
  $('#proposalStatusFilter').addEventListener('change', () => { listState.page = 0; loadProposals(); });
  $('#proposalsPrevPageBtn').addEventListener('click', () => { if (listState.page > 0) { listState.page -= 1; loadProposals(); } });
  $('#proposalsNextPageBtn').addEventListener('click', () => { listState.page += 1; loadProposals(); });
  $('#addProposalBtn').addEventListener('click', () => openAddProposalModal());
  $('#proposalBackBtn').addEventListener('click', () => showPage('proposalsPage'));
}
