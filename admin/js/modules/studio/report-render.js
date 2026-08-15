import { esc, formatDate } from '../dom.js';
import { computeMetrics, computeGrouped, computeTrend, filterRows } from './report-engine.js';

function currency(n) {
  return (Number(n) || 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
}

function renderCover(deliverable, targetName) {
  return `
    <section class="studio-cover">
      ${deliverable.logo_url ? `<img src="${esc(deliverable.logo_url)}" class="studio-cover__logo" alt="">` : ''}
      <h1>${esc(deliverable.name)}</h1>
      ${targetName ? `<p class="studio-cover__client">${esc(targetName)}</p>` : ''}
      ${deliverable.reporting_period ? `<p class="studio-cover__period">${esc(deliverable.reporting_period)}</p>` : ''}
    </section>
  `;
}

function renderNarrative(section) {
  const body = (section.config?.body || '').trim();
  return `
    <section class="studio-section">
      <h2>${esc(section.title)}</h2>
      ${body ? `<p class="studio-section__body">${esc(body).replace(/\n/g, '<br>')}</p>` : '<p class="qa-empty">لم تتم تعبئة هذا القسم بعد.</p>'}
    </section>
  `;
}

function renderMetrics(section, rows) {
  const metrics = computeMetrics(rows, section.config?.metrics);
  return `
    <section class="studio-section">
      <h2>${esc(section.title)}</h2>
      <div class="studio-metrics">
        ${metrics.map(m => `
          <div class="studio-metric-card">
            <span class="studio-metric-card__value">${m.format === 'currency' ? currency(m.value) + ' ﷼' : m.value.toLocaleString('ar-SA')}</span>
            <span class="studio-metric-card__label">${esc(m.label)}</span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderChartSection(section, rows, canvasJobs) {
  const cfg = section.config || {};
  const chartType = cfg.chartType || 'table';

  if (chartType === 'table') {
    const filtered = filterRows(rows, cfg);
    return `
      <section class="studio-section">
        <h2>${esc(section.title)}</h2>
        ${section.description ? `<p class="studio-section__hint">${esc(section.description)}</p>` : ''}
        ${renderDataTable(filtered)}
      </section>
    `;
  }

  const data = chartType === 'ranked_list' || cfg.groupBy
    ? (cfg.groupBy === 'start_date' ? computeTrend(rows, cfg) : computeGrouped(rows, cfg))
    : [];

  if (!data.length) {
    return `
      <section class="studio-section">
        <h2>${esc(section.title)}</h2>
        <p class="qa-empty">لا توجد بيانات كافية لعرض هذا القسم — تحقق من إعدادات التجميع.</p>
      </section>
    `;
  }

  if (chartType === 'ranked_list') {
    return `
      <section class="studio-section">
        <h2>${esc(section.title)}</h2>
        <ol class="studio-ranked-list">
          ${data.map(d => `<li><span>${esc(d.label)}</span><strong>${d.value.toLocaleString('ar-SA')}</strong></li>`).join('')}
        </ol>
      </section>
    `;
  }

  const canvasId = `studioChart-${section.section_key}`;
  canvasJobs.push({ canvasId, type: chartType === 'donut' ? 'doughnut' : chartType, data });
  return `
    <section class="studio-section">
      <h2>${esc(section.title)}</h2>
      <div class="studio-chart-wrap"><canvas id="${canvasId}"></canvas></div>
    </section>
  `;
}

function renderDataTable(rows) {
  if (!rows.length) return '<p class="qa-empty">لا توجد صفوف مطابقة.</p>';
  const cols = Object.keys(rows[0]).filter(k => rows.some(r => r[k] !== null && r[k] !== undefined && r[k] !== ''));
  return `
    <div class="table-wrap">
      <table class="print-doc__table">
        <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.slice(0, 200).map(r => `<tr>${cols.map(c => `<td>${esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      ${rows.length > 200 ? `<p class="qa-empty">تم عرض أول 200 صف من ${rows.length}.</p>` : ''}
    </div>
  `;
}

// Returns { html, canvasJobs }. Caller must insert `html` into the DOM
// before instantiating charts from `canvasJobs` (Chart.js needs the
// <canvas> to already exist).
export function renderDeliverable(deliverable, sections, rows, targetName) {
  const canvasJobs = [];
  const enabled = sections.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order);

  const body = enabled.map(section => {
    if (section.kind === 'cover') return renderCover(deliverable, targetName);
    if (section.kind === 'narrative') return renderNarrative(section);
    if (section.section_key === 'key_metrics') return renderMetrics(section, rows);
    return renderChartSection(section, rows, canvasJobs);
  }).join('');

  const html = `
    <div class="studio-doc" dir="${deliverable.language === 'en' ? 'ltr' : 'rtl'}" style="${deliverable.brand_primary ? `--studio-brand:${esc(deliverable.brand_primary)};` : ''}">
      ${body}
      <footer class="print-doc__footer">جدارة الأداء للاستشارات · تم إعداده بتاريخ ${formatDate(new Date().toISOString())}</footer>
    </div>
  `;
  return { html, canvasJobs };
}

export function instantiateCharts(canvasJobs, chartRegistry) {
  for (const job of canvasJobs) {
    const el = document.getElementById(job.canvasId);
    if (!el || typeof Chart === 'undefined') continue;
    if (chartRegistry[job.canvasId]) chartRegistry[job.canvasId].destroy();
    // eslint-disable-next-line no-undef
    chartRegistry[job.canvasId] = new Chart(el, {
      type: job.type,
      data: {
        labels: job.data.map(d => d.label),
        datasets: [{ data: job.data.map(d => d.value), backgroundColor: '#1a5276', borderColor: '#1a5276' }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: job.type === 'doughnut' } },
        scales: job.type === 'doughnut' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }
}
