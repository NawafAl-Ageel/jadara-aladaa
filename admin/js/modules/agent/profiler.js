import { getSupabase } from '../supabase-client.js';
import { logAudit } from '../audit.js';

/* The profiling agent — deep research on any prospective client.

   A run is a job, not a request. The row is created here, the Edge Function
   picks it up and keeps working in the background, and the UI polls until the
   status settles. That's what lets a run take as long as it needs instead of
   being cut short by a request timeout. */

export const STATUS_LABELS = {
  queued: 'في الانتظار',
  researching: 'جارٍ البحث',
  done: 'مكتمل',
  failed: 'فشل'
};

export async function startProfile({ entityName, aliases, context }) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();

  const { data: row, error } = await sb.from('entity_profiles').insert([{
    entity_name: entityName,
    aliases: aliases || [],
    provided_context: context || null,
    status: 'queued',
    created_by: user?.id || null
  }]).select('*').single();
  if (error) throw error;

  const { data, error: invokeError } = await sb.functions.invoke('profile-entity', {
    body: { profileId: row.id }
  });
  // The job row already exists, so a failed kick-off is recorded on it rather
  // than lost — otherwise the run would sit at "queued" with no explanation.
  if (invokeError || data?.error) {
    const message = data?.error || invokeError?.message || 'تعذر بدء البحث';
    await sb.from('entity_profiles')
      .update({ status: 'failed', error: message }).eq('id', row.id);
    throw new Error(message);
  }

  await logAudit('create', 'entity_profile', row.id, null, { entity: entityName });
  return row;
}

export async function getProfile(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from('entity_profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('entity_profiles')
    .select('id, entity_name, status, search_count, created_at, completed_at, error')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

// Lets a Go/No-Go reuse research already done for the same entity instead of
// paying for it twice.
export async function findProfileForEntity(entityName) {
  if (!entityName) return null;
  const sb = getSupabase();
  const { data } = await sb
    .from('entity_profiles')
    .select('*')
    .eq('status', 'done')
    .ilike('entity_name', `%${entityName.trim()}%`)
    .is('deleted_at', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

/* Polls until the job settles. Research runs for minutes, so this backs off
   rather than hammering, and gives up rather than polling forever — a stalled
   run should surface as stalled, not as a spinner that never resolves. */
export function pollProfile(id, onUpdate, { intervalMs = 5000, timeoutMs = 900000 } = {}) {
  const startedAt = Date.now();
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const row = await getProfile(id);
      onUpdate(row);
      if (row.status === 'done' || row.status === 'failed') return;
      if (Date.now() - startedAt > timeoutMs) {
        onUpdate({ ...row, status: 'failed', error: 'تجاوز البحث المهلة المتوقعة — تحقق من سجل الوظيفة.' });
        return;
      }
    } catch {
      // A transient read failure shouldn't kill the poll.
    }
    timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, 2000);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
