/* Consulting Studio — canonical data model + the Market Analysis template's
   section list. This is the single source of truth for both (the DB's
   consulting_templates.default_sections is NOT read by the app — see the
   comment in supabase/006_consulting_studio.sql for why). Same reusable
   field set works for cleaning services, IT, healthcare, anything — the
   template never hardcodes an industry. */

export const CANONICAL_FIELDS = [
  { key: 'opportunity_name', label: 'اسم الفرصة', type: 'text' },
  { key: 'entity', label: 'الجهة', type: 'text' },
  { key: 'region', label: 'المنطقة', type: 'text' },
  { key: 'city', label: 'المدينة', type: 'text' },
  { key: 'industry', label: 'القطاع', type: 'text' },
  { key: 'category', label: 'التصنيف', type: 'text' },
  { key: 'company', label: 'الشركة', type: 'text' },
  { key: 'competitor', label: 'المنافس', type: 'text' },
  { key: 'contract_value', label: 'قيمة العقد', type: 'number' },
  { key: 'estimated_value', label: 'القيمة التقديرية', type: 'number' },
  { key: 'award_value', label: 'قيمة الترسية', type: 'number' },
  { key: 'start_date', label: 'تاريخ البدء', type: 'date' },
  { key: 'end_date', label: 'تاريخ الانتهاء', type: 'date' },
  { key: 'status', label: 'الحالة', type: 'text' },
  { key: 'source', label: 'المصدر', type: 'text' },
  { key: 'description', label: 'الوصف', type: 'text' },
  { key: 'notes', label: 'ملاحظات', type: 'text' }
];

export const canonicalFieldLabels = Object.fromEntries(CANONICAL_FIELDS.map(f => [f.key, f.label]));
export const canonicalFieldsByType = (type) => CANONICAL_FIELDS.filter(f => f.type === type);

export const chartTypeLabels = {
  bar: 'عمود',
  donut: 'دائري',
  line: 'خط زمني',
  table: 'جدول',
  ranked_list: 'قائمة مرتبة'
};

export const aggregationLabels = {
  count: 'عدد الصفوف',
  sum: 'مجموع',
  avg: 'متوسط',
  min: 'أدنى قيمة',
  max: 'أعلى قيمة'
};

const METHODOLOGY_DEFAULT = 'تم إعداد هذا التقرير بناءً على تحليل البيانات المتاحة حول الفرص والمنافسين والجهات ذات العلاقة، دون افتراض بيانات غير موثقة. الأرقام والمؤشرات المعروضة محسوبة مباشرة من البيانات المرفوعة.';

// Fresh objects every call — deliverable creation copies these into
// consulting_sections rows, so nothing here should be a shared reference.
export function defaultSectionDefs() {
  return [
    { key: 'cover', kind: 'cover', title: 'الغلاف', description: 'شعار العميل واسم التقرير وفترة التقرير.', config: {} },
    { key: 'executive_summary', kind: 'narrative', title: 'الملخص التنفيذي', description: 'نظرة عامة موجزة على أهم النتائج.', config: { body: '' } },
    { key: 'key_metrics', kind: 'data', title: 'المؤشرات الرئيسية', description: 'بطاقات ملخصة لأهم الأرقام.', config: { metrics: ['count', 'sum_estimated_value', 'distinct_entity', 'distinct_competitor'] } },
    { key: 'market_overview', kind: 'narrative', title: 'نظرة عامة على السوق', description: '', config: { body: '' } },
    { key: 'opportunity_distribution', kind: 'data', title: 'توزيع الفرص', description: 'توزيع الفرص حسب التصنيف.', config: { chartType: 'bar', groupBy: 'category', aggregation: 'count', aggregateField: null } },
    { key: 'geographic_analysis', kind: 'data', title: 'التحليل الجغرافي', description: 'توزيع الفرص حسب المنطقة (قائمة مرتبة، وليس خريطة).', config: { chartType: 'bar', groupBy: 'region', aggregation: 'count', aggregateField: null } },
    { key: 'top_entities', kind: 'data', title: 'أبرز الجهات', description: 'الجهات الأعلى من حيث القيمة.', config: { chartType: 'ranked_list', groupBy: 'entity', aggregation: 'sum', aggregateField: 'estimated_value', limit: 10 } },
    { key: 'top_competitors', kind: 'data', title: 'أبرز المنافسين', description: 'المنافسون الأعلى من حيث القيمة.', config: { chartType: 'ranked_list', groupBy: 'competitor', aggregation: 'sum', aggregateField: 'estimated_value', limit: 10 } },
    { key: 'open_opportunities', kind: 'data', title: 'الفرص المفتوحة', description: 'اختر القيمة التي تمثل "مفتوحة" في عمود الحالة ببياناتك.', config: { chartType: 'table', filterField: 'status', filterValue: '' } },
    { key: 'awarded_contracts', kind: 'data', title: 'العقود المُرساة', description: 'اختر القيمة التي تمثل "مُرساة" في عمود الحالة ببياناتك.', config: { chartType: 'table', filterField: 'status', filterValue: '' } },
    { key: 'trend_analysis', kind: 'data', title: 'تحليل الاتجاه الزمني', description: 'عدد الفرص حسب شهر تاريخ البدء.', config: { chartType: 'line', groupBy: 'start_date', aggregation: 'count', aggregateField: null } },
    { key: 'recommendations', kind: 'narrative', title: 'التوصيات', description: '', config: { body: '' } },
    { key: 'risks', kind: 'narrative', title: 'المخاطر', description: '', config: { body: '' } },
    { key: 'methodology', kind: 'narrative', title: 'المنهجية', description: '', config: { body: METHODOLOGY_DEFAULT } },
    { key: 'data_sources', kind: 'narrative', title: 'مصادر البيانات', description: '', config: { body: '' } },
    { key: 'appendix', kind: 'data', title: 'الملحق', description: 'جدول البيانات الكامل.', config: { chartType: 'table' } }
  ];
}
