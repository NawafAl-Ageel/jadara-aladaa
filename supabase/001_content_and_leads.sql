-- Jadara admin panel expansion: content tables + lead enhancements.
-- Run this in the Supabase SQL editor for project gjuzaafqfsvmxhumpokp.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT throughout.

-- ============================================================
-- site_stats — the 7 hero counters (id.e. "200 institutional assessments")
-- ============================================================
create table if not exists site_stats (
  key text primary key,
  label text not null,
  value integer not null,
  sort_order integer not null default 0
);

alter table site_stats enable row level security;

drop policy if exists "site_stats_public_read" on site_stats;
create policy "site_stats_public_read" on site_stats
  for select to anon, authenticated using (true);

drop policy if exists "site_stats_admin_write" on site_stats;
create policy "site_stats_admin_write" on site_stats
  for all to authenticated using (true) with check (true);

insert into site_stats (key, label, value, sort_order) values
  ('assessments',   'تقييم مؤسسي شامل',              200,  1),
  ('guides',        'دليل تنظيمي وتشغيلي',            450,  2),
  ('strategies',    'استراتيجية مؤسسية تم تطويرها',   100,  3),
  ('leaders',       'قيادي تم تطويره وتأهيله',        4000, 4),
  ('pmo',           'تأسيس مكتب إدارة مشاريع (PMO)',  20,   5),
  ('transformation','مشروع تحول استراتيجي',           45,   6),
  ('workshops',     'ورشة عمل وبرنامج احترافي',       500,  7)
on conflict (key) do nothing;

-- ============================================================
-- services — description overrides for the 17 service cards.
-- Keyed by the same string used in the card's data-service attribute
-- (also what the contact form's service dropdown submits), so the
-- public page keeps its existing icons/layout and only swaps text.
-- ============================================================
create table if not exists services (
  service_key text primary key,
  description text not null,
  sort_order integer not null default 0
);

alter table services enable row level security;

drop policy if exists "services_public_read" on services;
create policy "services_public_read" on services
  for select to anon, authenticated using (true);

drop policy if exists "services_admin_write" on services;
create policy "services_admin_write" on services
  for all to authenticated using (true) with check (true);

insert into services (service_key, description, sort_order) values
  ('تحليل الوضع الراهن المؤسسي', 'إجراء تشخيص شامل لمستوى نضج المنظمة عبر تقييم الهياكل والعمليات والموارد لتحديد فرص التحسين وبناء أساس للتطوير.', 1),
  ('تصميم الاستراتيجيات والخطط التشغيلية', 'بناء استراتيجيات متكاملة مرتبطة بخطط تشغيلية واضحة، تترجم التوجهات العامة إلى أهداف ومبادرات قابلة للتنفيذ والقياس.', 2),
  ('بناء الهياكل التنظيمية ونماذج الحوكمة', 'تطوير هياكل تنظيمية فعّالة ونماذج حوكمة واضحة، تضمن وضوح الأدوار، وتعزز كفاءة اتخاذ القرار والانضباط المؤسسي.', 3),
  ('تطوير السياسات والإجراءات التنظيمية', 'إعداد وتحديث السياسات والإجراءات بما يحقق التوحيد في الممارسات، ويرفع مستوى الامتثال، ويدعم كفاءة التشغيل.', 4),
  ('تصميم مؤشرات الأداء وإدارة الأداء المؤسسي', 'بناء منظومة متكاملة لقياس الأداء تربط بين الأهداف الاستراتيجية والتشغيلية، وتعزز اتخاذ القرار المبني على البيانات.', 5),
  ('تحسين تجربة العميل والخدمات', 'تحليل وتطوير رحلة العميل ورفع جودة الخدمات المقدمة، بما يعزز رضا المستفيدين ويرفع القيمة المؤسسية.', 6),
  ('تصميم وتطوير النموذج التشغيلي', 'بناء وتطوير النموذج التشغيلي بما يحقق التكامل بين الاستراتيجية والعمليات والموارد، ويرفع كفاءة التنفيذ المؤسسي.', 7),
  ('إعادة هندسة العمليات', 'تحليل وإعادة تصميم العمليات الأساسية بهدف رفع الإنتاجية، وتقليل الهدر، وتحسين جودة المخرجات.', 8),
  ('إدارة التغيير المؤسسي', 'تطبيق منهجيات إدارة التغيير لضمان جاهزية المنظمة وتبني الفرق للتحولات الجديدة واستدامتها.', 9),
  ('التميز التشغيلي ورفع الكفاءة', 'تطبيق ممارسات التميز التشغيلي لتحسين الأداء العام وتعزيز الاستدامة في النتائج التشغيلية.', 10),
  ('تحسين الربحية والاستدامة المالية', 'مواءمة التكاليف مع الأنشطة التشغيلية، وتحسين هيكل الإيرادات، ورفع كفاءة استخدام الموارد لتحقيق استدامة مالية.', 11),
  ('التقييم والتشخيص القيادي', 'إجراء تقييم شامل للقدرات القيادية باستخدام أدوات تحليل متقدمة، لقياس الجاهزية القيادية وتحديد فجوات الأداء.', 12),
  ('تصميم برامج تطوير القيادات', 'تصميم برامج تطوير مخصصة تنطلق من احتياجات الجهة وتراعي السياق التنظيمي والتحديات الاستراتيجية.', 13),
  ('الإرشاد التنفيذي للقيادات العليا', 'تقديم جلسات إرشاد فردية وتفاعلية للقيادات التنفيذية، تركز على تطوير التفكير القيادي وجودة اتخاذ القرار.', 14),
  ('بناء المسارات القيادية التخصصية', 'تطوير مسارات قيادية واضحة بحسب المستويات الوظيفية، تضمن إعداد قيادات مستقبلية قادرة على تحمّل المسؤوليات المتقدمة.', 15),
  ('تطوير قدرات اتخاذ القرار', 'تنمية قدرات القادة على اتخاذ القرار في البيئات عالية التغيّر، من خلال تطبيقات عملية ومحاكاة واقعية للسيناريوهات القيادية.', 16),
  ('ربط الأداء القيادي بالأداء المؤسسي', 'مواءمة مخرجات التطوير القيادي مع مؤشرات الأداء المؤسسي، لضمان تحقيق أثر ملموس وقابل للقياس.', 17)
on conflict (service_key) do nothing;

-- ============================================================
-- client_logos — "Success Partners" logo grid
-- ============================================================
create table if not exists client_logos (
  id bigserial primary key,
  name text not null,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table client_logos enable row level security;

drop policy if exists "client_logos_public_read" on client_logos;
create policy "client_logos_public_read" on client_logos
  for select to anon, authenticated using (true);

drop policy if exists "client_logos_admin_write" on client_logos;
create policy "client_logos_admin_write" on client_logos
  for all to authenticated using (true) with check (true);

insert into client_logos (name, image_url, sort_order) values
  ('Al Haramain', 'Clients_logos/Al-haramain-2.png', 1),
  ('Alfozan', 'Clients_logos/alfozan.png', 2),
  ('Bank Aljazira', 'Clients_logos/Bank-Aljazira-01.png', 3),
  ('Authority of People with Disability', 'Clients_logos/Authority-of-People-with-Disability.png', 4),
  ('Awqaf', 'Clients_logos/Awqaf-Primary-01.png', 5),
  ('Dulani', 'Clients_logos/dulani.jpg', 6),
  ('Human Capability Development Program', 'Clients_logos/Human-Capability-Development-Program-02-01.png', 7),
  ('Ministry of Human Resources', 'Clients_logos/human_resources_ministry.png', 8),
  ('Kafaat', 'Clients_logos/kafaat.png', 9),
  ('King Abdulaziz University', 'Clients_logos/King-Abdulaziz-University-01.png', 10),
  ('Ministry of Commerce', 'Clients_logos/Ministry-of-Commerce-01.png', 11),
  ('Ministry of Environment, Water and Agriculture', 'Clients_logos/Ministry-of-Environment-Water-and-Agriculture-01.png', 12),
  ('Ministry of Interior', 'Clients_logos/Ministry-of-Interior.png', 13),
  ('Ministry of Municipalities & Housing', 'Clients_logos/Ministry-of-Municipalities-Housing_1.png', 14),
  ('National Center for Non-Profit Sector', 'Clients_logos/National-Center-for-Non-Profit-Sector.png', 15),
  ('National Transformation Program', 'Clients_logos/National-Transformation-Program.png', 16),
  ('Pilgrims Experience Program', 'Clients_logos/Pilgrims-Experience-Program.png', 17),
  ('Royal Commission for Makkah City & Holy Sites', 'Clients_logos/Royal-Commission-for-Makkah-City-Holy-Sites-1.png', 18),
  ('SABIC', 'Clients_logos/sabic.png', 19),
  ('Social Development Bank', 'Clients_logos/Social-Development-Bank-01-02.png', 20),
  ('Attejarat', 'Clients_logos/attejarat.png', 21),
  ('Coffee Address', 'Clients_logos/coffe_address.webp', 22),
  ('دوار السعادة', 'Clients_logos/dawar_alsaada.webp', 23),
  ('سقاية', 'Clients_logos/siqaya.png', 24),
  ('مجموعة وادي', 'Clients_logos/wadi_group.png', 25)
on conflict do nothing;

-- ============================================================
-- leads — assignment + lightweight activity log
-- ============================================================
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists activity jsonb not null default '[]'::jsonb;
