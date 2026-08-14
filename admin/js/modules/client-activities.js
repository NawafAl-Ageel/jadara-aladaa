import { getSupabase } from './supabase-client.js';

const ACTIVITY_TYPE_LABELS = {
  created: 'إنشاء العميل',
  status_changed: 'تغيير الحالة',
  note: 'ملاحظة',
  call: 'مكالمة هاتفية',
  email: 'بريد إلكتروني',
  meeting: 'اجتماع',
  follow_up_scheduled: 'جدولة متابعة',
  attachment_uploaded: 'رفع مرفق',
  proposal_created: 'إنشاء عرض',
  proposal_sent: 'إرسال عرض',
  project_created: 'إنشاء مشروع'
};

export function activityTypeLabel(type) {
  return ACTIVITY_TYPE_LABELS[type] || type;
}

export const LOGGABLE_ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up_scheduled'];

export async function fetchClientActivities(clientId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('client_activities')
    .select('*, profiles:user_id(full_name, email)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function logClientActivity(clientId, type, title, description = null, relatedObject = null) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('client_activities').insert([{
    client_id: clientId,
    type,
    title,
    description,
    user_id: user?.id || null,
    related_object: relatedObject
  }]);
  if (error) throw error;
}
