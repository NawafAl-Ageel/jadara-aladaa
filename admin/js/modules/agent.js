import { $ } from './dom.js';

/* Technical Proposal agent — the platform's single focus.

   Pipeline (being built): scope intake -> AI-drafted technical proposal ->
   published as a standalone HTML page on a unique link the client opens.
   Only the intake and listing shell exist so far; generation and publishing
   land next, once the proposal's required sections are confirmed. */

export async function loadAgent() {
  const el = $('#agentContent');
  if (!el) return;
  el.innerHTML = `
    <div class="empty-state">
      لا توجد عروض فنية مُولّدة بعد. ابدأ بعرض فني جديد.
    </div>
  `;
}

export function bindAgentEvents() {
  $('#newProposalBtn')?.addEventListener('click', () => {
    alert('نموذج إدخال نطاق العمل قيد الإنشاء — سيتم ربطه بمحرّك التوليد في الخطوة التالية.');
  });
}
