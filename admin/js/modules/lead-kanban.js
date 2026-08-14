import { $, esc, formatDate } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { SALES_STAGES, salesStageLabels, isOverdue, isDueToday } from './pipeline.js';
import { logLeadActivity } from './lead-activities.js';
import { openLeadDetail } from './lead-detail.js';

let draggedLeadId = null;

export async function loadKanban() {
  const board = $('#kanbanBoard');
  board.innerHTML = '<p class="qa-empty">جارٍ التحميل...</p>';

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('leads')
      .select('id,name,company,estimated_value,sales_stage,next_follow_up_date,assigned_to')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    renderKanban(data || []);
  } catch {
    board.innerHTML = '<p class="qa-empty">تعذر تحميل لوحة المسار</p>';
  }
}

function renderKanban(leads) {
  const board = $('#kanbanBoard');
  const byStage = Object.fromEntries(SALES_STAGES.map(s => [s.key, []]));
  for (const lead of leads) {
    (byStage[lead.sales_stage] || byStage.new).push(lead);
  }

  board.innerHTML = SALES_STAGES.map(stage => {
    const items = byStage[stage.key] || [];
    const total = items.reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);
    return `
      <div class="kanban-column" data-stage="${stage.key}">
        <div class="kanban-column__header">
          <span>${esc(stage.label)}</span>
          <span class="kanban-column__count">${items.length}</span>
        </div>
        ${total > 0 ? `<div class="kanban-column__total">${total.toLocaleString('ar-SA')} ريال</div>` : ''}
        <div class="kanban-column__cards">
          ${items.map(cardHtml).join('') || '<p class="qa-empty">لا يوجد</p>'}
        </div>
      </div>
    `;
  }).join('');

  board.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => openLeadDetail(Number(card.dataset.leadId)));
    card.addEventListener('dragstart', (e) => {
      draggedLeadId = Number(card.dataset.leadId);
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      draggedLeadId = null;
    });
  });

  board.querySelectorAll('.kanban-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('is-drop-target');
    });
    col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('is-drop-target');
      const newStage = col.dataset.stage;
      if (draggedLeadId == null) return;
      await moveLeadToStage(draggedLeadId, newStage, leads);
    });
  });
}

async function moveLeadToStage(leadId, newStage, leadsCache) {
  const lead = leadsCache.find(l => l.id === leadId);
  if (!lead || lead.sales_stage === newStage) return;

  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const { error } = await sb
      .from('leads')
      .update({ sales_stage: newStage, last_interaction_date: now, updated_at: now })
      .eq('id', leadId);
    if (error) throw error;
    await logLeadActivity(leadId, 'stage_changed', `تغيير المرحلة إلى «${salesStageLabels[newStage] || newStage}» (سحب وإفلات)`);
    loadKanban();
  } catch {
    alert('تعذر تحديث المرحلة');
    loadKanban();
  }
}

function cardHtml(lead) {
  const overdue = isOverdue(lead);
  const dueToday = isDueToday(lead);
  return `
    <div class="kanban-card" draggable="true" data-lead-id="${lead.id}">
      <p class="kanban-card__title">${esc(lead.company || lead.name)}</p>
      <p class="kanban-card__sub">${esc(lead.name)}</p>
      ${lead.estimated_value ? `<p class="kanban-card__value">${Number(lead.estimated_value).toLocaleString('ar-SA')} ريال</p>` : ''}
      <div class="kanban-card__meta">
        ${lead.assigned_to ? `<span class="kanban-card__assignee">${esc(lead.assigned_to)}</span>` : ''}
        ${lead.next_follow_up_date ? `<span class="kanban-card__due ${overdue ? 'is-overdue' : ''} ${dueToday ? 'is-today' : ''}">${formatDate(lead.next_follow_up_date)}</span>` : ''}
      </div>
    </div>
  `;
}
