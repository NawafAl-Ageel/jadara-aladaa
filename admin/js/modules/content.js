import { $, esc } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { PUBLIC_SITE_URL } from './constants.js';
import { setModalContent, openModal, closeModal } from './modal.js';
import { logAudit } from './audit.js';

export async function loadContent() {
  loadStatsContent();
  loadServicesContent();
  loadLogosContent();
}

async function loadStatsContent() {
  const sb = getSupabase();
  const tbody = $('#statsBody');
  tbody.innerHTML = '<tr><td colspan="3">جارٍ التحميل...</td></tr>';
  try {
    const { data, error } = await sb.from('site_stats').select('*').order('sort_order');
    if (error) throw error;
    tbody.innerHTML = '';
    for (const row of (data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(row.label)}</td>
        <td><input type="number" class="inline-input" value="${row.value}" data-key="${esc(row.key)}"></td>
        <td><button class="btn-save btn-save--sm" data-save-stat="${esc(row.key)}">حفظ</button></td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('[data-save-stat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-save-stat');
        const input = tbody.querySelector(`input[data-key="${key}"]`);
        btn.disabled = true;
        btn.textContent = '...';
        try {
          const { error } = await sb.from('site_stats').update({ value: Number(input.value) }).eq('key', key);
          if (error) throw error;
          await logAudit('update', 'site_stat', key, null, { value: Number(input.value) });
          btn.textContent = 'تم الحفظ';
        } catch {
          btn.textContent = 'خطأ';
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = 'حفظ'; }, 1200);
      });
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="3">تعذر التحميل</td></tr>';
  }
}

async function loadServicesContent() {
  const sb = getSupabase();
  const tbody = $('#servicesBody');
  tbody.innerHTML = '<tr><td colspan="3">جارٍ التحميل...</td></tr>';
  try {
    const { data, error } = await sb.from('services').select('*').order('sort_order');
    if (error) throw error;
    tbody.innerHTML = '';
    for (const row of (data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="services-cell-name">${esc(row.service_key)}</td>
        <td><textarea class="inline-textarea" rows="2" data-key="${esc(row.service_key)}">${esc(row.description)}</textarea></td>
        <td><button class="btn-save btn-save--sm" data-save-service="${esc(row.service_key)}">حفظ</button></td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('[data-save-service]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-save-service');
        const textarea = tbody.querySelector(`textarea[data-key="${CSS.escape(key)}"]`);
        btn.disabled = true;
        btn.textContent = '...';
        try {
          const { error } = await sb.from('services').update({ description: textarea.value }).eq('service_key', key);
          if (error) throw error;
          await logAudit('update', 'service', key, null, { description: textarea.value });
          btn.textContent = 'تم الحفظ';
        } catch {
          btn.textContent = 'خطأ';
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = 'حفظ'; }, 1200);
      });
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="3">تعذر التحميل</td></tr>';
  }
}

async function loadLogosContent() {
  const sb = getSupabase();
  const grid = $('#logosGrid');
  grid.innerHTML = '<p class="qa-empty">جارٍ التحميل...</p>';
  try {
    const { data, error } = await sb.from('client_logos').select('*').order('sort_order');
    if (error) throw error;
    grid.innerHTML = '';
    for (const logo of (data || [])) {
      const card = document.createElement('div');
      card.className = 'logo-card';
      const src = /^https?:\/\//i.test(logo.image_url) ? logo.image_url : `${PUBLIC_SITE_URL}/${logo.image_url}`;
      card.innerHTML = `
        <img src="${esc(src)}" alt="${esc(logo.name)}" loading="lazy" onerror="this.style.opacity=0.25">
        <span class="logo-card__name">${esc(logo.name)}</span>
        <button class="logo-card__del" data-del-logo="${logo.id}" aria-label="حذف">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      `;
      grid.appendChild(card);
    }
    grid.querySelectorAll('[data-del-logo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('حذف هذا الشعار؟')) return;
        const id = btn.getAttribute('data-del-logo');
        try {
          const { error } = await sb.from('client_logos').delete().eq('id', id);
          if (error) throw error;
          await logAudit('delete', 'client_logo', id);
          loadLogosContent();
        } catch {
          alert('تعذر الحذف');
        }
      });
    });
  } catch {
    grid.innerHTML = '<p class="qa-empty">تعذر التحميل</p>';
  }
}

export function openLogoModal() {
  const sb = getSupabase();
  setModalContent(`
    <h3>إضافة شعار عميل</h3>
    <div class="field">
      <label>اسم العميل</label>
      <input type="text" id="modalLogoName" placeholder="اسم الجهة">
    </div>
    <div class="field">
      <label>رابط الشعار</label>
      <input type="text" id="modalLogoUrl" placeholder="Clients_logos/example.png أو رابط كامل" dir="ltr">
    </div>
    <div class="modal__actions">
      <button class="btn-back" id="modalCancel">إلغاء</button>
      <button class="btn-save" id="modalSave">إضافة</button>
    </div>
  `);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', async () => {
    const name = $('#modalLogoName').value.trim();
    const url = $('#modalLogoUrl').value.trim();
    if (!name || !url) return;
    try {
      const { error } = await sb.from('client_logos').insert([{ name, image_url: url, sort_order: 999 }]);
      if (error) throw error;
      await logAudit('create', 'client_logo', null, null, { name, image_url: url });
      closeModal();
      loadLogosContent();
    } catch {
      alert('تعذر الإضافة');
    }
  });
  openModal();
}
