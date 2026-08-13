import { getSupabase } from './supabase-client.js';

/* Best-effort audit trail for sensitive actions. Never blocks the calling
   action — a failed audit insert is logged to the console and swallowed. */
export async function logAudit(action, entityType, entityId, before = null, after = null) {
  try {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('audit_logs').insert([{
      user_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      before,
      after
    }]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('audit log failed', e);
  }
}
