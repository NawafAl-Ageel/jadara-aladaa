import { $, esc } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { roleLabels } from './constants.js';
import { logAudit } from './audit.js';

const ROLE_OPTIONS = Object.entries(roleLabels);

let profilesCache = null;

// Reused by clients.js/projects.js to populate "assign to" dropdowns without
// each module needing its own profiles query.
export async function fetchActiveProfiles() {
  if (profilesCache) return profilesCache;
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('id, full_name, email').eq('active', true).order('full_name');
  if (error) throw error;
  profilesCache = data || [];
  return profilesCache;
}

export async function loadTeam() {
  const sb = getSupabase();
  const tbody = $('#teamBody');
  const empty = $('#teamEmptyState');
  tbody.innerHTML = '<tr><td colspan="5">جارٍ التحميل...</td></tr>';

  try {
    const { data, error } = await sb.from('profiles').select('*').order('created_at');
    if (error) throw error;
    const rows = data || [];
    tbody.innerHTML = '';

    if (rows.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    for (const person of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(person.full_name || '—')}</strong></td>
        <td dir="ltr">${esc(person.email || '—')}</td>
        <td>
          <select class="inline-input" data-role-select="${person.id}">
            ${ROLE_OPTIONS.map(([key, label]) => `<option value="${key}" ${key === person.role ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>
        </td>
        <td>
          <label class="team-active-toggle">
            <input type="checkbox" data-active-toggle="${person.id}" ${person.active ? 'checked' : ''}>
            <span>${person.active ? 'نشط' : 'موقوف'}</span>
          </label>
        </td>
        <td><button class="btn-save btn-save--sm" data-save-member="${person.id}">حفظ</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-save-member]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-save-member');
        const roleSelect = tbody.querySelector(`[data-role-select="${id}"]`);
        const activeToggle = tbody.querySelector(`[data-active-toggle="${id}"]`);
        const before = rows.find(r => r.id === id);
        const newRole = roleSelect.value;
        const newActive = activeToggle.checked;

        btn.disabled = true;
        btn.textContent = '...';
        try {
          const { error } = await sb.from('profiles')
            .update({ role: newRole, active: newActive })
            .eq('id', id);
          if (error) throw error;
          await logAudit('update', 'profile', id,
            { role: before?.role, active: before?.active },
            { role: newRole, active: newActive });
          btn.textContent = 'تم الحفظ';
        } catch {
          btn.textContent = 'خطأ (صلاحيات غير كافية؟)';
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = 'حفظ'; }, 1600);
      });
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="5">تعذر تحميل الفريق — تحتاج صلاحية مدير لعرض هذه الصفحة</td></tr>';
  }
}
