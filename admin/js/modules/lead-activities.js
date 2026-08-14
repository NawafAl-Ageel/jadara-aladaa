import { getSupabase } from './supabase-client.js';

const ACTIVITY_TYPE_LABELS = {
  created: 'إنشاء العميل المحتمل',
  status_changed: 'تغيير الحالة',
  stage_changed: 'تغيير مرحلة المسار',
  assigned: 'إسناد الموظف',
  note: 'ملاحظة',
  call: 'مكالمة هاتفية',
  email: 'بريد إلكتروني',
  meeting: 'اجتماع',
  follow_up_scheduled: 'جدولة متابعة',
  attachment_uploaded: 'رفع مرفق',
  proposal_created: 'إنشاء عرض',
  proposal_sent: 'إرسال عرض',
  converted: 'تحويل إلى عميل',
  won: 'فوز بالعميل المحتمل',
  lost: 'خسارة العميل المحتمل'
};

export function activityTypeLabel(type) {
  return ACTIVITY_TYPE_LABELS[type] || type;
}

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_LABELS);

// Types a user can log manually from the "add activity" composer, in display order.
export const LOGGABLE_ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up_scheduled'];

export async function fetchLeadActivities(leadId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('lead_activities')
    .select('*, profiles:user_id(full_name, email)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function logLeadActivity(leadId, type, title, description = null, relatedObject = null) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('lead_activities').insert([{
    lead_id: leadId,
    type,
    title,
    description,
    user_id: user?.id || null,
    related_object: relatedObject
  }]);
  if (error) throw error;
}
