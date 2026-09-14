import { getSupabase } from '../supabase-client.js';
import { logAudit } from '../audit.js';

/* Go/No-Go scoring + persistence.

   The weighted total and the decision band are computed HERE, not by the
   model — they're deterministic arithmetic over the official weights, and
   the four source decks show why that matters: هيئة التأمين scored 70.25
   and its own band table said "مشاركة" while the slide said "مشاركة
   بشروط". Arithmetic the model can drift on becomes arithmetic it can't. */

// Mirrors gonogo_criteria (009_gonogo_assessments.sql). Fetched from the DB
// at runtime; this is the fallback if that table isn't reachable yet.
const FALLBACK_CRITERIA = [
  { key: 'strategic_alignment', label_ar: 'التوافق الاستراتيجي', weight: 0.25, inverted: false, sort_order: 1 },
  { key: 'capability_readiness', label_ar: 'جاهزية القدرات', weight: 0.25, inverted: false, sort_order: 2 },
  { key: 'commercial_value', label_ar: 'الجاذبية التجارية', weight: 0.20, inverted: false, sort_order: 3 },
  { key: 'risk', label_ar: 'المخاطر (معكوسة)', weight: 0.15, inverted: true, sort_order: 4 },
  { key: 'win_probability', label_ar: 'احتمالية الفوز', weight: 0.15, inverted: false, sort_order: 5 }
];

// Where each criterion's score lives inside the generated assessment.
const SCORE_PATHS = {
  strategic_alignment: (a) => a?.strategic_alignment?.score,
  capability_readiness: (a) => a?.capabilities?.score,
  commercial_value: (a) => a?.commercial?.score,
  risk: (a) => a?.risks?.score,
  win_probability: (a) => a?.competitive?.score
};

export const DECISION_LABELS = {
  go: 'مشاركة',
  go_with_conditions: 'مشاركة بشروط',
  borderline: 'حدّي — يحتاج مراجعة',
  no_go: 'عدم مشاركة'
};

// Standardized bands — see the comment in 009_gonogo_assessments.sql for why
// these and not the other two schemes the source decks used.
export function decisionBand(total) {
  if (total >= 80) return 'go';
  if (total >= 60) return 'go_with_conditions';
  if (total >= 40) return 'borderline';
  return 'no_go';
}

export async function loadCriteria() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('gonogo_criteria').select('*').order('sort_order');
    if (error || !data?.length) return FALLBACK_CRITERIA;
    return data;
  } catch {
    return FALLBACK_CRITERIA;
  }
}

// The benchmark the reader is shown against ("you scored 7, the average is
// 6.47"). Deliberately fetched AFTER generation — never fed to the model,
// which would anchor its scores to the historical mean.
export async function loadAverages() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('gonogo_criteria_averages').select('*').order('sort_order');
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export function scoreAssessment(assessment, criteria) {
  const rows = criteria.map(c => {
    const raw = Number(SCORE_PATHS[c.key]?.(assessment));
    const score = Number.isFinite(raw) ? Math.min(10, Math.max(0, raw)) : 0;
    return {
      key: c.key,
      label_ar: c.label_ar,
      weight: Number(c.weight),
      score,
      weighted: Math.round(score * Number(c.weight) * 10 * 100) / 100
    };
  });
  const total = Math.round(rows.reduce((s, r) => s + r.weighted, 0) * 100) / 100;
  return { rows, total, decision: decisionBand(total) };
}

export async function loadCapabilities() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('jadara_capabilities').select('*').order('area');
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/* Jadara's capability profile is sent with the request so the model scores
   جاهزية القدرات by comparing the tender's required-team table against what
   Jadara actually has, instead of against a paragraph of generic self-
   description. The Edge Function resolves the Hijri deadline itself. */
export async function generateAssessment({ rfpText, entityName }) {
  const sb = getSupabase();
  const capabilities = await loadCapabilities();

  const { data, error } = await sb.functions.invoke('generate-gonogo', {
    body: { rfpText, entityName, capabilities }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function saveAssessment({ assessment, extraction, deadline, entityProfile, model, sourceText, scoring }) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const meta = assessment.meta || {};

  const { data: row, error } = await sb.from('gonogo_assessments').insert([{
    entity_name: meta.entity_name || 'غير محدد',
    project_title: meta.project_title || null,
    rfp_reference: meta.rfp_reference || null,
    sector: meta.sector || null,
    opportunity_type: meta.opportunity_type || null,
    submission_deadline: deadline?.gregorian || toDate(meta.submission_deadline),
    submission_deadline_hijri: deadline?.hijri || null,
    days_to_deadline: deadline?.days_remaining ?? null,
    request_date: toDate(meta.request_date),
    expected_duration: meta.expected_duration || null,
    estimated_value_min: assessment.commercial?.estimated_value_min ?? null,
    estimated_value_max: assessment.commercial?.estimated_value_max ?? null,
    win_probability_min: assessment.competitive?.win_probability_min ?? null,
    win_probability_max: assessment.competitive?.win_probability_max ?? null,
    total_score: scoring.total,
    decision: scoring.decision,
    content: assessment,
    extraction: extraction || null,
    source_text: sourceText,
    entity_profile: entityProfile ? { text: entityProfile } : null,
    generated_by_model: model || null,
    created_by: user?.id || null
  }]).select('*').single();
  if (error) throw error;

  const { error: scoreError } = await sb.from('gonogo_scores').insert(
    scoring.rows.map(r => ({
      assessment_id: row.id,
      criterion_key: r.key,
      score: r.score,
      rationale: null
    }))
  );
  if (scoreError) throw scoreError;

  await logAudit('create', 'gonogo_assessment', row.id, null, {
    entity: row.entity_name, total: scoring.total, decision: scoring.decision
  });

  return row;
}

export async function listAssessments() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('gonogo_assessments')
    .select('id, entity_name, project_title, rfp_reference, sector, total_score, decision, submission_deadline, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function getAssessment(id) {
  const sb = getSupabase();
  const [{ data: row, error }, { data: scores }] = await Promise.all([
    sb.from('gonogo_assessments').select('*').eq('id', id).single(),
    sb.from('gonogo_scores').select('*').eq('assessment_id', id)
  ]);
  if (error) throw error;
  return { row, scores: scores || [] };
}
