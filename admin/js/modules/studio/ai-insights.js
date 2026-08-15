import { getSupabase } from '../supabase-client.js';
import { logAudit } from '../audit.js';
import { computeMetrics, computeGrouped } from './report-engine.js';

/* Facts sent to the AI are computed with the exact same functions the
   report itself renders with (report-engine.js) — the AI never sees raw
   rows, only the same numbers a human reviewer can already see on-screen,
   so "grounded in the dataset" is structural, not just a prompt promise. */
function buildFacts(rows) {
  return {
    row_count: rows.length,
    metrics: computeMetrics(rows, ['count', 'sum_estimated_value', 'distinct_entity', 'distinct_competitor']),
    top_entities: computeGrouped(rows, { groupBy: 'entity', aggregation: 'sum', aggregateField: 'estimated_value', limit: 5 }),
    top_competitors: computeGrouped(rows, { groupBy: 'competitor', aggregation: 'sum', aggregateField: 'estimated_value', limit: 5 }),
    by_category: computeGrouped(rows, { groupBy: 'category', aggregation: 'count', limit: 8 }),
    by_region: computeGrouped(rows, { groupBy: 'region', aggregation: 'count', limit: 8 })
  };
}

// Calls the Edge Function, records a consulting_insights history row, and
// updates the section's live config (body + ai_status) in the DB. Returns
// the generated body text so the caller can patch the on-screen textarea.
export async function generateInsight(deliverable, section, rows) {
  const sb = getSupabase();
  const facts = buildFacts(rows);

  const { data, error } = await sb.functions.invoke('generate-insight', {
    body: {
      deliverableName: deliverable.name,
      sectionKey: section.section_key,
      sectionTitle: section.title,
      language: deliverable.language,
      facts
    }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const { data: { user } } = await sb.auth.getUser();
  const { data: insight, error: insertError } = await sb.from('consulting_insights').insert([{
    deliverable_id: deliverable.id,
    section_id: section.id,
    content: data.body,
    status: 'ai_generated',
    generated_by_model: data.model,
    source_summary: facts,
    created_by: user?.id || null
  }]).select('*').single();
  if (insertError) throw insertError;

  const config = { ...section.config, body: data.body, ai_status: 'ai_generated', last_insight_id: insight.id };
  const { error: updateError } = await sb.from('consulting_sections')
    .update({ config, updated_at: new Date().toISOString() })
    .eq('id', section.id);
  if (updateError) throw updateError;

  await logAudit('create', 'consulting_insight', insight.id, null, { section_id: section.id, deliverable_id: deliverable.id });

  section.config = config;
  return data.body;
}
