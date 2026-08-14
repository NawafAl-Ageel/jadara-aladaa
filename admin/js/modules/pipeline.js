/* Sales pipeline constants + small date helpers shared by the table, Kanban
   and detail views. Single source of truth for stage order/labels so the
   three views can never drift out of sync. */

export const SALES_STAGES = [
  { key: 'new', label: 'جديد' },
  { key: 'contacted', label: 'تم التواصل' },
  { key: 'qualified', label: 'مؤهل' },
  { key: 'proposal_sent', label: 'تم إرسال العرض' },
  { key: 'negotiation', label: 'تفاوض' },
  { key: 'won', label: 'فاز' },
  { key: 'lost', label: 'مفقود' }
];

export const salesStageLabels = Object.fromEntries(SALES_STAGES.map(s => [s.key, s.label]));

export const priorityLabels = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية'
};

export const sourceLabels = {
  website: 'الموقع الإلكتروني',
  referral: 'ترشيح',
  event: 'فعالية',
  cold_outreach: 'تواصل مباشر',
  other: 'أخرى'
};

export function isOverdue(lead) {
  if (!lead.next_follow_up_date || ['won', 'lost'].includes(lead.sales_stage)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return lead.next_follow_up_date < today;
}

export function isDueToday(lead) {
  if (!lead.next_follow_up_date || ['won', 'lost'].includes(lead.sales_stage)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return lead.next_follow_up_date === today;
}
