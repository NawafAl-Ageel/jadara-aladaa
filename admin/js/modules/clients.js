import { getSupabase } from './supabase-client.js';
import { logAudit } from './audit.js';
import { logLeadActivity } from './lead-activities.js';

/* Minimal client-conversion logic for Phase 1. The full Clients module
   (list/detail UI, contacts, documents) ships in Phase 2 on top of the same
   `clients` table — this file only covers "convert a won lead into a client
   record" and grows into the full module then. */

export async function convertLeadToClient(lead) {
  if (lead.converted_to_client_id) {
    throw new Error('ALREADY_CONVERTED');
  }
  const sb = getSupabase();

  const { data: client, error } = await sb
    .from('clients')
    .insert([{
      name: lead.company || lead.name,
      source_lead_id: lead.id,
      status: 'prospect'
    }])
    .select('*')
    .single();
  if (error) {
    // unique_violation on the source_lead_id guard = someone already converted
    // this lead (race between a double-click or two staff acting at once).
    if (error.code === '23505') throw new Error('ALREADY_CONVERTED');
    throw error;
  }

  const { error: updateError } = await sb
    .from('leads')
    .update({ converted_to_client_id: client.id })
    .eq('id', lead.id);
  if (updateError) throw updateError;

  await logLeadActivity(lead.id, 'converted', 'تم تحويل العميل المحتمل إلى عميل', `تم إنشاء سجل عميل: ${client.name}`, { client_id: client.id });
  await logAudit('create', 'client', client.id, null, { source_lead_id: lead.id });

  return client;
}
