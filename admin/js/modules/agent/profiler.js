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
  failed: 'فشل',
  cancelled: 'موقوف'
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
    .select('id, entity_name, status, stage, exa_status, exa_cost, progress_note, created_at, completed_at, error')
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

/* Each tick calls the function, which checks the Exa run and ingests the
   result once it's finished. That's why this polls the function rather than
   just reading the row: the row only advances when something asks Exa.

   No wall-clock deadline — Exa decides how long the research takes, and the
   previous version declared failure at fifteen minutes on a run that was
   fine. Since Exa holds the run, a closed tab doesn't lose anything: the
   research continues, and the next tick from anyone ingests it. */
export function pollProfile(id, onUpdate, { intervalMs = 5000 } = {}) {
  const sb = getSupabase();
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      // Errors returned in the body are handled through the row below, which
      // carries the message the function recorded.
      await sb.functions.invoke('profile-entity', { body: { profileId: id } });
    } catch {
      // A dropped check just means waiting for the next tick.
    }
    if (stopped) return;

    try {
      const row = await getProfile(id);
      onUpdate(row);
      if (row.status === 'done' || row.status === 'failed' ||
          row.status === 'cancelled') return;
    } catch {
      // A transient read failure shouldn't kill the poll.
    }
    timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, 1500);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/* Stops a run that is still going.

   Exa's graceful /stop — which keeps whatever was found — is only offered on
   "max" effort runs, and ours are "medium", so this discards the research.
   Usage accrued before the stop is still billed, which is the whole reason to
   stop early: it caps the bill rather than avoiding it.

   Returns `raced: true` when the research happened to finish first. In that
   case nothing was stopped and the caller should keep polling — the result is
   already paid for, and discarding it would be the one outcome with no upside.

   A run started but never given an Exa id is just marked stopped; there is
   nothing on Exa's side to call. */
export async function cancelProfile(id) {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('profile-entity', {
    body: { profileId: id, action: 'cancel' }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.raced) await logAudit('update', 'entity_profile', id, null, { action: 'cancel' });
  return data;
}

/* Restarts a run that failed or was stopped. The Exa run id is cleared so a
   fresh one starts — neither a failed nor a cancelled run will produce
   anything on re-check, so there is nothing to resume from. */
export async function resumeProfile(id) {
  const sb = getSupabase();
  await sb.from('entity_profiles')
    .update({ status: 'queued', error: null, exa_run_id: null, exa_status: null })
    .eq('id', id);
  const { data, error } = await sb.functions.invoke('profile-entity', { body: { profileId: id } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
