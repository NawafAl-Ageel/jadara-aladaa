/* ============================================
   JADARA ADMIN DASHBOARD — JavaScript
   ============================================ */

const $ = (sel) => document.querySelector(sel);

const statusLabels = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  contacted: 'تم التواصل',
  closed: 'مغلق'
};

let debounceTimer = null;
let sbClient;

function getMeta(name) {
  return (document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '').trim();
}

function initSupabase() {
  if (sbClient) return sbClient;
  const url = getMeta('supabase-url');
  const anonKey = getMeta('supabase-anon-key');
  if (!url || !anonKey) throw new Error('Supabase configuration missing (supabase-url / supabase-anon-key).');
  // eslint-disable-next-line no-undef
  sbClient = window.supabase.createClient(url, anonKey);
  return sbClient;
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
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
    const { data } = await sbClient.auth.getSession();
    if (data.session?.user) {
      enterDashboard(data.session.user.email || 'admin');
      return;
    }
    showView('loginView');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
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
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPass').value;
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    enterDashboard(data.user?.email || email);
  } catch (error) {
    errEl.textContent = error?.message || 'تعذر تسجيل الدخول';
  }

  btn.disabled = false;
  btn.textContent = 'تسجيل الدخول';
}

async function handleLogout() {
  await sbClient.auth.signOut();
  showView('loginView');
  $('#loginForm').reset();
  $('#loginError').textContent = '';
}

/* ---------- Stats ---------- */

async function loadStats() {
  try {
    const { data, error } = await sbClient
      .from('leads')
      .select('id,status,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;

    const total = data.length;
    const byStatus = { new: 0, in_review: 0, contacted: 0, closed: 0 };
    for (const l of data) {
      if (l.status && byStatus[l.status] !== undefined) byStatus[l.status] += 1;
    }
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const todayCount = data.filter(l => (l.created_at || '').slice(0, 10) === todayKey).length;

    $('#statTotal').textContent = total;
    $('#statNew').textContent = byStatus.new;
    $('#statReview').textContent = byStatus.in_review;
    $('#statContacted').textContent = byStatus.contacted;
    $('#statClosed').textContent = byStatus.closed;
    $('#statToday').textContent = todayCount;
  } catch { /* silent */ }
}

/* ---------- Leads Table ---------- */

async function loadLeads() {
  const search = $('#searchInput').value.trim();
  const status = $('#statusFilter').value;

  try {
    let q = sbClient
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (status) q = q.eq('status', status);
    if (search) {
      const s = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    const { data: leads, error } = await q;
    if (error) throw error;
    renderTable(leads || []);
    const empty = $('#emptyState');
    const wrap = $('.table-wrap');
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
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => openLeadDetail(lead.id));
    tr.innerHTML = `
      <td>${lead.id}</td>
      <td><strong>${esc(lead.name)}</strong></td>
      <td>${esc(lead.job_title || '—')}</td>
      <td>${esc(lead.company || '—')}</td>
      <td>${esc(lead.service || '—')}</td>
      <td><a href="mailto:${esc(lead.email)}" onclick="event.stopPropagation()">${esc(lead.email)}</a></td>
      <td dir="ltr">${esc(lead.phone)}</td>
      <td><span class="badge badge--${lead.status}">${statusLabels[lead.status] || lead.status}</span></td>
      <td>${formatDate(lead.created_at)}</td>
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
    const { data: lead, error } = await sbClient.from('leads').select('*').eq('id', id).single();
    if (error) throw error;
    renderDetail(lead);
  } catch {
    $('#detailContent').innerHTML = '<p style="text-align:center;color:#dc2626;padding:48px">تعذر تحميل البيانات</p>';
  }
}

function renderDetail(lead) {
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
              <span class="detail-label">المسمى الوظيفي</span>
              <span class="detail-value">${esc(lead.job_title || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الشركة</span>
              <span class="detail-value">${esc(lead.company || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الخدمة المطلوبة</span>
              <span class="detail-value">${esc(lead.service || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">البريد الإلكتروني</span>
              <span class="detail-value detail-value-row">
                <a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>
                <button type="button" class="copy-btn" data-copy="${esc(lead.email)}" data-label="البريد الإلكتروني" aria-label="نسخ البريد الإلكتروني" title="نسخ">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="11" height="11" rx="2"></rect>
                    <path d="M5 15V6a2 2 0 0 1 2-2h9"></path>
                  </svg>
                </button>
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">الهاتف</span>
              <span class="detail-value detail-value-row">
                <a href="tel:${esc(lead.phone)}" class="phone-link" dir="ltr">${esc(lead.phone)}</a>
                <button type="button" class="copy-btn" data-copy="${esc(lead.phone)}" data-label="الهاتف" aria-label="نسخ رقم الهاتف" title="نسخ">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="11" height="11" rx="2"></rect>
                    <path d="M5 15V6a2 2 0 0 1 2-2h9"></path>
                  </svg>
                </button>
              </span>
            </div>
            <div class="detail-item detail-item--full">
              <span class="detail-label">الرسالة</span>
              <span class="detail-value">${esc(lead.message)}</span>
            </div>
          </div>
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
  document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = btn.getAttribute('data-copy') || '';
      const label = btn.getAttribute('data-label') || 'القيمة';
      const ok = await copyToClipboard(text);
      btn.classList.toggle('is-copied', ok);
      setTimeout(() => { btn.classList.remove('is-copied'); }, 420);
      if (!ok) alert(`تعذر نسخ ${label}`);
    });
  });
}

async function saveLead(id) {
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  try {
    const { data: updated, error } = await sbClient
      .from('leads')
      .update({
        status: $('#detailStatus').value,
        notes: $('#detailNotes').value,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    await loadStats();
    await loadLeads();
    renderDetail(updated);
  } catch {
    alert('حدث خطأ أثناء الحفظ');
  }

  btn.disabled = false;
  btn.textContent = 'حفظ التغييرات';
}

async function deleteLead(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;

  try {
    const { error } = await sbClient.from('leads').delete().eq('id', id);
    if (error) throw error;
    await loadStats();
    await loadLeads();
    showPage('listPage');
  } catch {
    alert('تعذر الحذف');
  }
}

/* ---------- Export ---------- */

async function handleExport() {
  try {
    const status = $('#statusFilter').value;
    let q = sbClient
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    let csv = '\uFEFF';
    csv += 'ID,الاسم,المسمى الوظيفي,الشركة,الخدمة المطلوبة,البريد الإلكتروني,الهاتف,الرسالة,الحالة,ملاحظات,تاريخ الإنشاء\n';
    for (const l of (data || [])) {
      const escCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      csv += [
        l.id,
        escCsv(l.name),
        escCsv(l.job_title),
        escCsv(l.company),
        escCsv(l.service),
        escCsv(l.email),
        escCsv(l.phone),
        escCsv(l.message),
        l.status,
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

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
