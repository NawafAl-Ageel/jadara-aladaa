/* ============================================
   JADARA ADMIN DASHBOARD — JavaScript
   ============================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const PUBLIC_SITE_URL = 'https://jadara-aladaa.sa';

const statusLabels = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  contacted: 'تم التواصل',
  closed: 'مغلق'
};

let debounceTimer = null;
let sbClient;
let allLeadsCache = [];
let charts = {};

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

const pageTitles = {
  dashboardPage: 'لوحة المعلومات',
  listPage: 'الطلبات الواردة',
  detailPage: 'تفاصيل الطلب',
  contentPage: 'محتوى الموقع',
  settingsPage: 'الإعدادات'
};

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('page--active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('page--active');

  $$('.sidebar__link').forEach(l => l.classList.toggle('is-active', l.dataset.tab === id));
  const title = $('#topbarTitle');
  if (title && pageTitles[id]) title.textContent = pageTitles[id];

  document.body.classList.remove('sidebar-open');

  if (id === 'dashboardPage') loadDashboard();
  if (id === 'listPage') loadLeads();
  if (id === 'contentPage') loadContent();
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
  showPage('dashboardPage');
  $('#adminUsername').textContent = username;
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

  $$('.sidebar__link').forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.tab));
  });

  $('#menuToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });

  $$('.content-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.content-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      $$('.content-panel').forEach(p => p.classList.remove('content-panel--active'));
      $(`#${tab.dataset.contentTab}`).classList.add('content-panel--active');
    });
  });

  $('#addLogoBtn')?.addEventListener('click', () => openLogoModal());
  $('#modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === $('#modalOverlay')) closeModal();
  });
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

/* ---------- Dashboard ---------- */

async function loadDashboard() {
  try {
    const { data, error } = await sbClient
      .from('leads')
      .select('id,status,service,created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    allLeadsCache = data || [];
    renderStats(allLeadsCache);
    renderCharts(allLeadsCache);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

function renderStats(data) {
  const total = data.length;
  const byStatus = { new: 0, in_review: 0, contacted: 0, closed: 0 };
  for (const l of data) {
    if (l.status && byStatus[l.status] !== undefined) byStatus[l.status] += 1;
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCount = data.filter(l => (l.created_at || '').slice(0, 10) === todayKey).length;

  $('#statTotal').textContent = total;
  $('#statNew').textContent = byStatus.new;
  $('#statReview').textContent = byStatus.in_review;
  $('#statContacted').textContent = byStatus.contacted;
  $('#statClosed').textContent = byStatus.closed;
  $('#statToday').textContent = todayCount;
}

function renderCharts(data) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'IBM Plex Sans Arabic', sans-serif";

  // Trend: last 30 days
  const days = [];
  const counts = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }));
    counts.push(data.filter(l => (l.created_at || '').slice(0, 10) === key).length);
  }
  drawChart('trendChart', 'line', {
    labels: days,
    datasets: [{
      label: 'الطلبات',
      data: counts,
      borderColor: '#1a5276',
      backgroundColor: 'rgba(26,82,118,0.08)',
      fill: true,
      tension: 0.35,
      pointRadius: 0
    }]
  }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } });

  // Status funnel
  const byStatus = { new: 0, in_review: 0, contacted: 0, closed: 0 };
  for (const l of data) {
    if (l.status && byStatus[l.status] !== undefined) byStatus[l.status] += 1;
  }
  drawChart('statusChart', 'doughnut', {
    labels: Object.keys(byStatus).map(k => statusLabels[k]),
    datasets: [{
      data: Object.values(byStatus),
      backgroundColor: ['#166534', '#92400e', '#374151', '#991b1b']
    }]
  }, { plugins: { legend: { position: 'bottom' } } });

  // Top requested services
  const bySvc = {};
  for (const l of data) {
    const key = l.service || 'غير محدد';
    bySvc[key] = (bySvc[key] || 0) + 1;
  }
  const top = Object.entries(bySvc).sort((a, b) => b[1] - a[1]).slice(0, 8);
  drawChart('serviceChart', 'bar', {
    labels: top.map(([k]) => k),
    datasets: [{
      label: 'عدد الطلبات',
      data: top.map(([, v]) => v),
      backgroundColor: '#1a5276'
    }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
  });
}

function drawChart(canvasId, type, data, options) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(el, { type, data, options: { responsive: true, maintainAspectRatio: false, ...options } });
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
      <td>${esc(lead.assigned_to || '—')}</td>
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

function renderActivity(activity) {
  if (!Array.isArray(activity) || activity.length === 0) {
    return '<p class="qa-empty">لا يوجد سجل تغييرات بعد</p>';
  }
  return activity.slice().reverse().map(a => `
    <div class="activity-item">
      <span class="activity-item__dot"></span>
      <div>
        <p class="activity-item__text">${esc(a.text)}</p>
        <span class="activity-item__date">${formatDate(a.at)}</span>
      </div>
    </div>
  `).join('');
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

      <div class="detail-card">
        <div class="detail-card__header"><h3>سجل النشاط</h3></div>
        <div class="detail-card__body">
          <div class="activity-list">${renderActivity(lead.activity)}</div>
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
          <label>المسؤول عن المتابعة</label>
          <input type="text" id="detailAssignee" placeholder="اسم أو بريد الموظف" value="${esc(lead.assigned_to || '')}">
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

  $('#saveBtn').addEventListener('click', () => saveLead(lead));
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

async function saveLead(prevLead) {
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const newStatus = $('#detailStatus').value;
  const newAssignee = $('#detailAssignee').value.trim();
  const newNotes = $('#detailNotes').value;

  const activity = Array.isArray(prevLead.activity) ? prevLead.activity.slice() : [];
  const now = new Date().toISOString();
  if (newStatus !== prevLead.status) {
    activity.push({ at: now, text: `تغيير الحالة إلى «${statusLabels[newStatus] || newStatus}»` });
  }
  if (newAssignee !== (prevLead.assigned_to || '')) {
    activity.push({ at: now, text: newAssignee ? `تم إسناد الطلب إلى ${newAssignee}` : 'تمت إزالة المسؤول عن المتابعة' });
  }
  if (newNotes !== (prevLead.notes || '')) {
    activity.push({ at: now, text: 'تم تحديث الملاحظات' });
  }

  try {
    const { data: updated, error } = await sbClient
      .from('leads')
      .update({
        status: newStatus,
        assigned_to: newAssignee || null,
        notes: newNotes,
        activity,
        updated_at: now
      })
      .eq('id', prevLead.id)
      .select('*')
      .single();
    if (error) throw error;
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
    showPage('listPage');
    await loadLeads();
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
    csv += 'ID,الاسم,المسمى الوظيفي,الشركة,الخدمة المطلوبة,البريد الإلكتروني,الهاتف,الرسالة,المسؤول,الحالة,ملاحظات,تاريخ الإنشاء\n';
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
        escCsv(l.assigned_to),
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

/* ---------- Content (CMS) ---------- */

async function loadContent() {
  loadStatsContent();
  loadServicesContent();
  loadLogosContent();
}

async function loadStatsContent() {
  const tbody = $('#statsBody');
  tbody.innerHTML = '<tr><td colspan="3">جارٍ التحميل...</td></tr>';
  try {
    const { data, error } = await sbClient.from('site_stats').select('*').order('sort_order');
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
          const { error } = await sbClient.from('site_stats').update({ value: Number(input.value) }).eq('key', key);
          if (error) throw error;
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
  const tbody = $('#servicesBody');
  tbody.innerHTML = '<tr><td colspan="3">جارٍ التحميل...</td></tr>';
  try {
    const { data, error } = await sbClient.from('services').select('*').order('sort_order');
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
          const { error } = await sbClient.from('services').update({ description: textarea.value }).eq('service_key', key);
          if (error) throw error;
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
  const grid = $('#logosGrid');
  grid.innerHTML = '<p class="qa-empty">جارٍ التحميل...</p>';
  try {
    const { data, error } = await sbClient.from('client_logos').select('*').order('sort_order');
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
          const { error } = await sbClient.from('client_logos').delete().eq('id', id);
          if (error) throw error;
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

function openLogoModal() {
  const box = $('#modalBox');
  box.innerHTML = `
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
  `;
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', async () => {
    const name = $('#modalLogoName').value.trim();
    const url = $('#modalLogoUrl').value.trim();
    if (!name || !url) return;
    try {
      const { error } = await sbClient.from('client_logos').insert([{ name, image_url: url, sort_order: 999 }]);
      if (error) throw error;
      closeModal();
      loadLogosContent();
    } catch {
      alert('تعذر الإضافة');
    }
  });
  $('#modalOverlay').classList.add('is-visible');
}

function closeModal() {
  $('#modalOverlay').classList.remove('is-visible');
  $('#modalBox').innerHTML = '';
}

/* ---------- Helpers ---------- */

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
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
