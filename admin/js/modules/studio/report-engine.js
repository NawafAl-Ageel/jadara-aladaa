import { canonicalFieldLabels } from './constants.js';

/* Pure compute functions: canonical rows + section config in, plain data
   out. No DOM, no rendering — report-render.js turns this into markup/
   charts. Keeping these separate makes both independently testable and
   is what lets the exact same template work across industries: nothing
   here knows or cares what "category" or "entity" actually mean. */

const METRIC_DEFS = {
  count: (rows) => ({ label: 'إجمالي الفرص', value: rows.length, format: 'number' }),
  sum_estimated_value: (rows) => ({
    label: 'إجمالي القيمة التقديرية',
    value: rows.reduce((s, r) => s + (Number(r.estimated_value) || 0), 0),
    format: 'currency'
  }),
  distinct_entity: (rows) => ({ label: 'عدد الجهات', value: new Set(rows.map(r => r.entity).filter(Boolean)).size, format: 'number' }),
  distinct_competitor: (rows) => ({ label: 'عدد المنافسين', value: new Set(rows.map(r => r.competitor).filter(Boolean)).size, format: 'number' })
};

export function computeMetrics(rows, metricKeys) {
  return (metricKeys || []).map(key => {
    const def = METRIC_DEFS[key];
    return def ? { key, ...def(rows) } : null;
  }).filter(Boolean);
}

function aggregate(values, aggregation) {
  const nums = values.map(Number).filter(n => Number.isFinite(n));
  switch (aggregation) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'min': return nums.length ? Math.min(...nums) : 0;
    case 'max': return nums.length ? Math.max(...nums) : 0;
    case 'count':
    default: return values.length;
  }
}

// Groups rows by a canonical field and aggregates another (or counts rows
// if no aggregate field is set), sorted descending, capped by `limit`.
export function computeGrouped(rows, { groupBy, aggregation = 'count', aggregateField, limit }) {
  if (!groupBy) return [];
  const buckets = new Map();
  for (const row of rows) {
    const key = row[groupBy];
    if (key === null || key === undefined || key === '') continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(aggregateField ? row[aggregateField] : 1);
  }
  let result = Array.from(buckets.entries()).map(([label, values]) => ({
    label: String(label),
    value: aggregation === 'count' ? values.length : aggregate(values, aggregation)
  }));
  result.sort((a, b) => b.value - a.value);
  if (limit) result = result.slice(0, limit);
  return result;
}

// Trend: groups by year-month of a date field. Falls back gracefully to
// an empty series (rendered as "no date data") rather than fabricating
// a timeline — matches the no-invented-data principle used throughout.
export function computeTrend(rows, { groupBy = 'start_date', aggregation = 'count', aggregateField }) {
  const buckets = new Map();
  for (const row of rows) {
    const raw = row[groupBy];
    if (!raw) continue;
    const month = String(raw).slice(0, 7); // YYYY-MM
    if (!buckets.has(month)) buckets.set(month, []);
    buckets.get(month).push(aggregateField ? row[aggregateField] : 1);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, values]) => ({ label, value: aggregation === 'count' ? values.length : aggregate(values, aggregation) }));
}

export function filterRows(rows, { filterField, filterValue }) {
  if (!filterField || !filterValue) return rows;
  return rows.filter(r => String(r[filterField] ?? '') === String(filterValue));
}

export function fieldLabel(key) {
  return canonicalFieldLabels[key] || key;
}
