import { $, esc, formatDate } from './dom.js';

/* Print-to-PDF via the browser's native print dialog (@media print in
   admin.css hides everything except this overlay) — no PDF library, no
   server render, per the architecture decision in
   docs/consulting-platform-plan.md §2.5. A small local status-label map
   avoids importing from proposals.js, which imports this module — keeps
   the dependency graph a one-way DAG instead of a cycle. */
const statusLabels = {
  draft: 'مسودة', internal_review: 'مراجعة داخلية', sent: 'مُرسل',
  viewed: 'تمت المشاهدة', accepted: 'مقبول', rejected: 'مرفوض', expired: 'منتهي'
};

function currency(n) {
  return (Number(n) || 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function openProposalPrint(proposal, items, totals) {
  const targetName = proposal.clients?.name || proposal.leads?.company || proposal.leads?.name || '';
  const lineItems = items.filter(it => it.service_key && it.service_key.trim());

  $('#printContent').innerHTML = `
    <div class="print-doc">
      <header class="print-doc__header">
        <img src="assets/jadara-logo.png" alt="جدارة الأداء" class="print-doc__logo">
        <div class="print-doc__meta">
          <h1>عرض تقديم خدمات استشارية</h1>
          <p>رقم العرض: <strong dir="ltr">${esc(proposal.proposal_number || '')}</strong></p>
          <p>التاريخ: ${formatDate(proposal.created_at)}</p>
          ${proposal.expires_at ? `<p>صالح حتى: ${formatDate(proposal.expires_at)}</p>` : ''}
          <p>الحالة: ${esc(statusLabels[proposal.status] || proposal.status)}</p>
        </div>
      </header>

      <section class="print-doc__section">
        <h2>${esc(proposal.project_title)}</h2>
        <p>مقدم إلى: <strong>${esc(targetName)}</strong></p>
      </section>

      ${proposal.scope ? `<section class="print-doc__section"><h3>نطاق العمل</h3><p>${esc(proposal.scope).replace(/\n/g, '<br>')}</p></section>` : ''}
      ${proposal.deliverables ? `<section class="print-doc__section"><h3>التسليمات</h3><p>${esc(proposal.deliverables).replace(/\n/g, '<br>')}</p></section>` : ''}
      ${proposal.timeline ? `<section class="print-doc__section"><h3>الجدول الزمني</h3><p>${esc(proposal.timeline)}</p></section>` : ''}

      <section class="print-doc__section">
        <h3>البنود والأسعار</h3>
        <table class="print-doc__table">
          <thead><tr><th>البند</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
          <tbody>
            ${lineItems.map(it => `
              <tr>
                <td>${esc(it.service_key)}</td>
                <td>${esc(it.description || '')}</td>
                <td>${esc(String(it.quantity))}</td>
                <td>${currency(it.unit_price)} ﷼</td>
                <td>${currency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))} ﷼</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="print-doc__totals">
          <div><span>الإجمالي الفرعي</span><strong>${currency(totals.subtotal)} ﷼</strong></div>
          <div><span>الخصم</span><strong>-${currency(totals.discountAmount)} ﷼</strong></div>
          <div><span>ضريبة القيمة المضافة (${esc(String(proposal.vat_rate))}%)</span><strong>${currency(totals.vatAmount)} ﷼</strong></div>
          <div class="print-doc__grand-total"><span>الإجمالي</span><strong>${currency(totals.total)} ﷼</strong></div>
        </div>
      </section>

      ${proposal.terms ? `<section class="print-doc__section"><h3>الشروط والأحكام</h3><p>${esc(proposal.terms).replace(/\n/g, '<br>')}</p></section>` : ''}

      <footer class="print-doc__footer">جدارة الأداء للاستشارات · jadara-aladaa.sa</footer>
    </div>
  `;

  $('#printOverlay').classList.add('is-visible');
}

export function bindPrintOverlay() {
  $('#printCloseBtn').addEventListener('click', () => $('#printOverlay').classList.remove('is-visible'));
  $('#printNowBtn').addEventListener('click', () => window.print());
}
