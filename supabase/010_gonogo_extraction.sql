-- Jadara — structured RFP extraction + Jadara's own capability profile.
-- Run in the SQL editor: STAGING (unerkmnbezefiaoljvni) first. Safe to re-run.
--
-- Derived from four real tender documents the CEO supplied on 2026-09-15:
-- HRDF كراسة 354030, إنفاذ (مركز الإسناد والتصفية), جامعة الأمير مقرن (حوكمة),
-- plus HRDF's ملف الملحقات. The two large ones are the identical Ministry of
-- Finance / EXPRO standard template (قرار 1440، المعدل بقرار 1156)، 73 clauses
-- in a fixed order — so the facts below always live in predictable clauses,
-- and the agent can be told where to look instead of guessing.

-- ============================================================
-- The extracted hard facts of a tender, kept separate from the AI's
-- judgement. These are quoted from the document, not inferred: evaluation
-- weights, the required team table, bonds, penalties, Saudization. They're
-- what actually decides a go/no-go, and the previous version of the agent
-- ignored every one of them.
-- ============================================================
alter table gonogo_assessments add column if not exists extraction jsonb;

-- Submission deadlines in these tenders are Hijri (1447/1448). Stored
-- alongside the Gregorian conversion so "days remaining" is computable and
-- auditable rather than a number the model asserted.
alter table gonogo_assessments add column if not exists submission_deadline_hijri text;
alter table gonogo_assessments add column if not exists days_to_deadline int;

-- ============================================================
-- jadara_capabilities — what Jadara can actually field.
--
-- The single most decisive input in these tenders is the required-team
-- table: HRDF demands 2 consultants holding an EFQM assessor certificate
-- with 10 years' experience (plus 6 more staff); إنفاذ demands KAQA-certified
-- assessors, 2 of them on-site at their HQ for 8 months. Scoring "جاهزية
-- القدرات" without knowing what Jadara has is guesswork — which is exactly
-- what the four sample decks kept flagging as their own open condition
-- ("التحقق من توفر مقيّمين معتمدين", "تأكيد توفر الفريق").
--
-- Practice areas below are seeded from Jadara's own Go/No-Go decks, which
-- assert them. Headcount and availability are deliberately left NULL — no
-- document evidences them, and inventing them would defeat the purpose.
-- ============================================================
create table if not exists jadara_capabilities (
  id bigserial primary key,
  area text not null,
  role text,
  certifications text[] not null default '{}',
  headcount int,
  available_headcount int,
  typical_years_experience int,
  saudi_headcount int,
  evidence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area, role)
);

insert into jadara_capabilities (area, role, certifications, evidence) values
  ('استمرارية الأعمال والتعافي من الكوارث', 'مستشار BCM/DRP', '{"ISO 22301"}',
   'مذكور في تقييم DAN_RFP_105 كـ"كفاءة أساسية" و"متخصصون بشهادات ISO 22301"'),
  ('الجودة وتدقيق الآيزو', 'مدقق آيزو معتمد', '{"ISO 9001","ISO 31022"}',
   'مذكور في تقييم هيئة التأمين 2026513: "مدققون معتمدون في الآيزو ومتخصصون في إدارة الجودة"'),
  ('التميز المؤسسي وتقييم النضج', 'مستشار تميز مؤسسي', '{"KAQA","EFQM"}',
   'مذكور في تقييمي إنفاذ وGSO: "فهم عميق للنموذج الوطني للتميز ومعايير KAQA" و"إطار EFQM"'),
  ('الحوكمة وإدارة المخاطر والامتثال (GRC)', 'مستشار حوكمة', '{}',
   'ممارسة أساسية متكررة في التقييمات الأربعة'),
  ('تطوير المنهجيات والأطر التنظيمية', 'مستشار تنظيمي', '{}',
   'مذكور في تقييم هيئة التقييس GSO CAD-S-5'),
  ('بناء القدرات والتدريب', 'مدرب معتمد', '{}',
   'مذكور في تقييم هيئة التأمين: "مدرب معتمد متاح"')
on conflict (area, role) do nothing;

create index if not exists idx_jadara_capabilities_area on jadara_capabilities (area);

alter table jadara_capabilities enable row level security;

drop policy if exists "jadara_capabilities_staff_all" on jadara_capabilities;
create policy "jadara_capabilities_staff_all" on jadara_capabilities
  for all to authenticated using (true) with check (true);
