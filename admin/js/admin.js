/* ============================================
   JADARA ADMIN DASHBOARD — JavaScript
   ============================================ */

const API = '/api';
const $ = (sel) => document.querySelector(sel);

const statusLabels = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  contacted: 'تم التواصل',
  closed: 'مغلق'
};

let debounceTimer = null;

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  bindEvents();
});

/* ---------- View Management ---------- */

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view--active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('view--active');
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('page--active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('page--active');
}

/* ---------- Auth ---------- */

async function checkAuth() {
  try {
    const res = await fetch(`${API}/admin/me`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      enterDashboard(data.username);
    } else {
      showView('loginView');
    }
  } catch {
    showView('loginView');
  }
}

function enterDashboard(username) {
  showView('adminView');
  showPage('listPage');
  $('#adminUsername').textContent = username;
  loadStats();
  loadLeads();
}

/* ---------- Event Binding ---------- */

function bindEvents() {
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutBtn').addEventListener('click', handleLogout);
  $('#searchInput').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadLeads(), 300);
  });
  $('#statusFilter').addEventListener('change', () => loadLeads());
  $('#exportBtn').addEventListener('click', handleExport);
  $('#backBtn').addEventListener('click', () => showPage('listPage'));
}

/* ---------- Login / Logout ---------- */

async function handleLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn');
  const errEl = $('#loginError');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'جارٍ الدخول...';

  try {
    const res = await fetch(`${API}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: $('#loginUser').value.trim(),
        password: $('#loginPass').value
      })
    });

    const data = await res.json();

    if (res.ok) {
      enterDashboard(data.username);
    } else {
      errEl.textContent = data.error || 'خطأ في تسجيل الدخول';
    }
  } catch {
    errEl.textContent = 'تعذر الاتصال بالخادم';
  }

  btn.disabled = false;
  btn.textContent = 'تسجيل الدخول';
}

async function handleLogout() {
  await fetch(`${API}/admin/logout`, { method: 'POST', credentials: 'include' });
  showView('loginView');
  $('#loginForm').reset();
  $('#loginError').textContent = '';
}

/* ---------- Stats ---------- */

async function loadStats() {
  try {
    const res = await fetch(`${API}/admin/stats`, { credentials: 'include' });
    if (!res.ok) return;
    const d = await res.json();
    $('#statTotal').textContent = d.total;
    $('#statNew').textContent = d.new;
    $('#statReview').textContent = d.in_review;
    $('#statContacted').textContent = d.contacted;
    $('#statClosed').textContent = d.closed;
    $('#statToday').textContent = d.today;
  } catch { /* silent */ }
}

/* ---------- Leads Table ---------- */

async function loadLeads() {
  const search = $('#searchInput').value.trim();
  const status = $('#statusFilter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  try {
    const res = await fetch(`${API}/admin/leads?${params}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    renderTable(data.leads);
    const empty = $('#emptyState');
    const wrap = $('.table-wrap');
    if (data.leads.length === 0) {
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
      <td>${esc(lead.company || '—')}</td>
      <td><a href="mailto:${esc(lead.email)}" onclick="event.stopPropagation()">${esc(lead.email)}</a></td>
      <td dir="ltr">${esc(lead.phone)}</td>
      <td><span class="badge badge--${lead.status}">${statusLabels[lead.status] || lead.status}</span></td>
      <td>${formatDate(lead.created_at)}</td>
      <td><span class="badge ${lead.questionnaire ? 'badge--has-q' : 'badge--no-q'}">${lead.questionnaire ? 'مكتمل' : 'لا يوجد'}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- Lead Detail (Full Page) ---------- */

async function openLeadDetail(id) {
  showPage('detailPage');
  $('#detailContent').innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-muted)">جارٍ التحميل...</p>';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const res = await fetch(`${API}/admin/leads/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error();
    const lead = await res.json();
    renderDetail(lead);
  } catch {
    $('#detailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function renderDetail(lead) {
  let qHTML = '';
  if (lead.questionnaire && lead.questionnaire.length > 0) {
    const items = lead.questionnaire.map(q =>
      `<div class="qa-item"><span class="qa-q">${esc(q.question)}</span><span class="qa-a">${esc(q.answer)}</span></div>`
    ).join('');
    qHTML = `<div class="qa-list">${items}</div>`;
  } else {
    qHTML = '<p class="qa-empty">لم يتم تعبئة الاستبيان</p>';
  }

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
              <span class="detail-label">الشركة</span>
              <span class="detail-value">${esc(lead.company || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">البريد الإلكتروني</span>
              <span class="detail-value"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الهاتف</span>
              <span class="detail-value" dir="ltr"><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></span>
            </div>
            <div class="detail-item detail-item--full">
              <span class="detail-label">الرسالة</span>
              <span class="detail-value">${esc(lead.message)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Questionnaire Card -->
      <div class="detail-card">
        <div class="detail-card__header">
          <h3>الاستبيان</h3>
        </div>
        <div class="detail-card__body">
          ${qHTML}
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

  $('#saveBtn').addEventListener('click', () => saveLead(lead.id));
  $('#deleteBtn').addEventListener('click', () => deleteLead(lead.id));
}

async function saveLead(id) {
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  try {
    const res = await fetch(`${API}/admin/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        status: $('#detailStatus').value,
        notes: $('#detailNotes').value
      })
    });

    if (res.ok) {
      const updated = await res.json();
      loadStats();
      loadLeads();
      renderDetail(updated);
    } else {
      const data = await res.json();
      alert(data.error || 'حدث خطأ');
    }
  } catch {
    alert('تعذر الاتصال بالخادم');
  }

  btn.disabled = false;
  btn.textContent = 'حفظ التغييرات';
}

async function deleteLead(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;

  try {
    const res = await fetch(`${API}/admin/leads/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (res.ok) {
      loadStats();
      loadLeads();
      showPage('listPage');
    }
  } catch {
    alert('تعذر الحذف');
  }
}

/* ---------- Export ---------- */

function handleExport() {
  const status = $('#statusFilter').value;
  const params = status ? `?status=${status}` : '';
  window.open(`${API}/admin/leads/export${params}`, '_blank');
}

/* ---------- Helpers ---------- */

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}
