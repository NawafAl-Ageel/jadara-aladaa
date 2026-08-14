import { esc, formatDate } from './dom.js';

/* Shared rendering for any per-entity activity timeline (leads, clients, ...).
   Entity-specific modules (lead-activities.js, client-activities.js) own the
   CRUD + type list + labels; this module only knows how to draw them. */

export function renderTimeline(activities, typeLabelFn) {
  if (!activities.length) return '<p class="qa-empty">لا يوجد نشاط بعد</p>';
  return activities.map(a => `
    <div class="activity-item">
      <span class="activity-item__dot activity-item__dot--${esc(a.type)}"></span>
      <div>
        <p class="activity-item__text"><strong>${esc(typeLabelFn(a.type))}</strong> — ${esc(a.title)}</p>
        ${a.description ? `<p class="activity-item__desc">${esc(a.description)}</p>` : ''}
        <span class="activity-item__date">${esc(a.profiles?.full_name || a.profiles?.email || 'النظام')} · ${formatDate(a.created_at)}</span>
      </div>
    </div>
  `).join('');
}

export function renderComposer(loggableTypes, typeLabelFn) {
  return `
    <form class="activity-form" data-activity-composer>
      <select data-activity-type>
        ${loggableTypes.map(t => `<option value="${t}">${esc(typeLabelFn(t))}</option>`).join('')}
      </select>
      <input type="text" data-activity-title placeholder="عنوان مختصر" required>
      <textarea data-activity-desc placeholder="تفاصيل إضافية (اختياري)" rows="2"></textarea>
      <button type="submit" class="btn-save btn-save--sm">إضافة للسجل</button>
    </form>
  `;
}

// Wires a composer form rendered via renderComposer(). `onSubmit` receives
// (type, title, description) and should log the activity + refresh the list.
export function bindComposer(formEl, onSubmit) {
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = formEl.querySelector('[data-activity-type]').value;
    const title = formEl.querySelector('[data-activity-title]').value.trim();
    const description = formEl.querySelector('[data-activity-desc]').value.trim() || null;
    if (!title) return;

    const btn = formEl.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await onSubmit(type, title, description);
      formEl.reset();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('activity submit failed', err);
      alert('تعذر إضافة النشاط: ' + (err?.message || String(err)));
    }
    btn.disabled = false;
  });
}
