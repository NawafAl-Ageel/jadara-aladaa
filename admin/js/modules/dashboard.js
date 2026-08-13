import { $ } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { state } from './state.js';
import { statusLabels } from './constants.js';

export async function loadDashboard() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('leads')
      .select('id,status,service,created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    state.allLeadsCache = data || [];
    renderStats(state.allLeadsCache);
    renderCharts(state.allLeadsCache);
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
  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  state.charts[canvasId] = new Chart(el, { type, data, options: { responsive: true, maintainAspectRatio: false, ...options } });
}
