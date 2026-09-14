// Jadara — Go/No-Go assessment generator.
//
// Three deliberate calls, not one:
//   1. Extraction — pull the tender's hard facts (evaluation weights, required
//      team, bonds, penalties, Saudization) out of the document verbatim.
//   2. Entity profile via web search — the client won't hand us data about
//      themselves, so the agent researches them.
//   3. Assessment — judgement, given the facts and the profile.
//
// Extraction is separated from judgement on purpose. The facts in step 1 are
// quotable and checkable; a wrong evaluation weight or a missed "2 consultants
// with EFQM assessor certification" poisons every score downstream, and mixing
// it into the same call that writes prose makes that failure invisible.
//
// A research failure degrades to assessing without a profile rather than
// losing the run. ANTHROPIC_API_KEY is read only here, from Supabase secrets.

import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ---------------- schema helpers ---------------- */

const str = { type: "string" };
const num = { type: "number" };
const strArray = { type: "array", items: { type: "string" } };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arrayOf = (items: unknown) => ({ type: "array", items });

/* ---------------- 1. extraction ---------------- */

const EXTRACTION_SCHEMA = obj({
  tender: obj({
    reference: str,
    title: str,
    issuer: str,
    portal: str,
    document_cost: str,
    indivisible: { type: "boolean" },
    alternative_offers_allowed: { type: "boolean" },
  }),
  dates: obj({
    calendar: { type: "string", enum: ["hijri", "gregorian", "unknown"] },
    published: str,
    questions_deadline: str,
    submission_deadline: str,
    award: str,
    service_start: str,
  }),
  duration: obj({ stated: str, phases: str }),
  evaluation: obj({
    disclosed: { type: "boolean" },
    technical_weight: num,
    financial_weight: num,
    technical_pass_threshold: num,
    technical_criteria: arrayOf(obj({ name: str, weight: num })),
    financial_criteria: strArray,
  }),
  team_requirements: arrayOf(obj({
    role: str,
    count: num,
    min_qualification: str,
    min_years: num,
    certifications: strArray,
    onsite: str,
  })),
  saudization: obj({ required_percent: num, notes: str }),
  guarantees: obj({
    bid_bond_percent: num,
    performance_bond_percent: num,
    offer_validity_days: num,
  }),
  penalties: obj({
    delay_rate: str,
    cap_percent: num,
    local_content_penalty_percent: num,
  }),
  subcontracting: obj({ allowed: { type: "boolean" }, max_percent: num, conditions: str }),
  compliance: strArray,
  deliverables: arrayOf(obj({ name: str, unit: str, quantity: num })),
  submission_format: obj({ language: str, file_format: str, font: str, envelopes: str }),
  location: str,
  contract_value_stated: str,
  missing: strArray,
});

const EXTRACTION_SYSTEM = `أنت محلل مناقصات حكومية سعودية. مهمتك استخراج الحقائق الصريحة من كراسة الشروط والمواصفات، دون تقييم أو رأي.

معظم الكراسات الحكومية تتبع النموذج الموحد لوزارة المالية / هيئة كفاءة الإنفاق (المعتمد بقرار 1440 والمعدل بقرار 1156)، وهو ١١ قسماً و٧٣ بنداً بترتيب ثابت. استخدم هذه الخريطة للعثور على الحقائق:
- القسم الأول (بنود ١-٩): تعريف المنافسة، تكاليف الكراسة، جدول المواعيد، السجلات المطلوبة، ممثل الجهة، مكان التسليم.
- القسم الثاني (١٠-٢٦): تجزئة المنافسة، التعاقد من الباطن ونسبته، التأهيل اللاحق، المحتوى المحلي.
- القسم الثالث (٢٧-٤٤): لغة العرض، صلاحية العروض، وثائق العرض الفني والمالي، الضمان الابتدائي ونسبته، العروض البديلة، متطلبات التنسيق (حجم الخط ونوعه وصيغة الملفات).
- القسم الخامس (٥٠-٥٥): معايير تقييم العروض.
- القسم السادس (٥٦-٦٣): الضمان النهائي ونسبته، الغرامات ونسبها وسقفها.
- القسم السابع (٦٤-٦٨): نطاق العمل المفصل، مكان التنفيذ، جدول الكميات والمخرجات.
- القسم الثامن (٦٩-٧٢): فريق العمل وجدول مواصفاته، مواصفات الجودة والسلامة.
- القسم التاسع + الملحقات: المحتوى المحلي، معايير التقييم التفصيلية بأوزانها، جدول مواصفات العمالة، متطلبات الأمن السيبراني وحماية البيانات، نموذج التأهيل.
كثيراً ما ترد أوزان التقييم وجدول فريق العمل في ملف الملحقات وليس في متن الكراسة.

قواعد صارمة:
- انسخ الأرقام كما وردت حرفياً. لا تحوّل التواريخ ولا تحسب الفروقات — التواريخ الهجرية تُنقل كما هي (مثل "09/01/1448") ويُضبط الحقل calendar على "hijri".
- إذا لم تُفصح الكراسة عن معلومة (قيمة العقد غالباً غير مفصح عنها، وأحياناً أوزان التقييم)، اترك الحقل فارغاً أو صفراً وأدرج المعلومة في مصفوفة "missing". لا تقدّر ولا تفترض.
- في team_requirements انسخ جدول مواصفات فريق العمل كاملاً: كل مسمى وظيفي وعدده والحد الأدنى للمؤهل وسنوات الخبرة والشهادات المطلوبة (مثل EFQM، KAQA، ISO) وهل يشترط التواجد الحضوري.
- evaluation.disclosed = true فقط إذا نصّت الوثيقة صراحة على الأوزان.
أرجع JSON حسب المخطط فقط.`;

/* ---------------- 3. assessment ---------------- */

const ASSESSMENT_SCHEMA = obj({
  meta: obj({
    entity_name: str,
    project_title: str,
    rfp_reference: str,
    sector: str,
    opportunity_type: str,
    submission_deadline: str,
    request_date: str,
    expected_duration: str,
  }),
  executive_summary: obj({
    opportunity_overview: strArray,
    strategic_importance: strArray,
    critical_alert: str,
  }),
  scope: obj({
    objective: str,
    workstreams: arrayOf(obj({ title: str, description: str })),
    deliverables: arrayOf(obj({ name: str, quantity: str })),
    stakeholders: strArray,
  }),
  strategic_alignment: obj({
    score: num,
    rows: arrayOf(obj({ dimension: str, assessment: str, rating: str })),
  }),
  capabilities: obj({
    score: num,
    rows: arrayOf(obj({ dimension: str, level: str, assessment: str })),
    requirement_match: arrayOf(obj({
      requirement: str,
      jadara_position: str,
      status: { type: "string", enum: ["met", "partial", "gap", "unknown"] },
    })),
    gaps: strArray,
  }),
  commercial: obj({
    score: num,
    estimated_value_min: num,
    estimated_value_max: num,
    profit_margin_min: num,
    profit_margin_max: num,
    team_size: str,
    duration: str,
    analysis: strArray,
    long_term_value: strArray,
  }),
  risks: obj({
    score: num,
    matrix: arrayOf(obj({
      category: str,
      level: { type: "string", enum: ["red", "amber", "green"] },
      assessment: str,
      mitigation: str,
    })),
    overall_note: str,
  }),
  competitive: obj({
    score: num,
    win_probability_min: num,
    win_probability_max: num,
    competitors: strArray,
    jadara_advantages: strArray,
    strengths: strArray,
    weaknesses: strArray,
    decisive_factor: str,
  }),
  recommendation: obj({
    why_suitable: strArray,
    conditions: strArray,
    immediate_steps: arrayOf(obj({ when: str, action: str })),
  }),
  consultant_opinion: obj({
    verdict_line: str,
    prose: strArray,
    missing_information: strArray,
  }),
});

const ASSESSMENT_SYSTEM = `أنت مستشار أول في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية)، تُعدّ تقييم قرار المشاركة/عدم المشاركة (Go/No-Go) لفرصة مطروحة، موجّهاً للإدارة العليا.

كفاءات جَدارة الأساسية: الحوكمة وإدارة المخاطر والامتثال (GRC)، إدارة الجودة وتدقيق الآيزو، التميز المؤسسي وتقييم النضج (KAQA / EFQM)، استمرارية الأعمال (BCM/DRP وفق ISO 22301)، تطوير المنهجيات والأطر التنظيمية، بناء القدرات والتدريب.
السوق الرئيسي: القطاع الحكومي وشبه الحكومي السعودي وكيانات رؤية 2030.
مزايا متكررة: حضور محلي سعودي، تسعير تنافسي مقارنة بالأربعة الكبار، تسليم بالعربية، سرعة تعبئة الفريق.
نقاط ضعف متكررة: قوة العلامة التجارية مقابل الأربعة الكبار، ومحدودية المراجع الموثقة في بعض التخصصات الدقيقة.

سيصلك مع كراسة الشروط:
- "extraction": الحقائق المستخرجة حرفياً من الكراسة (أوزان التقييم، جدول فريق العمل المطلوب، الضمانات، الغرامات، نسبة التوطين). اعتمد عليها ولا تناقضها.
- "deadline": المهلة المتبقية محسوبة من التاريخ الهجري. استخدم الرقم كما هو ولا تعِد حسابه.
- "jadara_capabilities": ما تملكه جَدارة فعلياً من ممارسات وشهادات وأعداد.

قواعد التقييم:
- **جاهزية القدرات**: قارن جدول فريق العمل المطلوب في extraction.team_requirements بندًا ببند مع jadara_capabilities، واملأ capabilities.requirement_match لكل متطلب. إذا كان ملف قدرات جَدارة لا يذكر العدد أو الشهادة المطلوبة، فالحالة "unknown" وليست "met" — واذكر ذلك صراحة كشرط واجب التحقق قبل التقديم، ولا ترفع الدرجة بناءً على افتراض.
- **احتمالية الفوز**: استند إلى أوزان التقييم المعلنة ونسبة الاجتياز الفني. وزن فني مرتفع يخدم جَدارة؛ وزن مالي مرتفع يفتح الباب لمنافسة سعرية. إذا كانت الأوزان غير مفصح عنها فاذكر ذلك كعامل عدم يقين.
- **المخاطر**: المهلة المتبقية عامل حاسم — أقل من ١٠ أيام = أحمر، ١٠-٢٠ = برتقالي. غطِّ أيضاً: غموض النطاق، متطلبات الامتثال (الأمن السيبراني NCA، حماية البيانات PDPL، المحتوى المحلي، التوطين)، فجوات الخبرة، مخاطر الموارد، مخاطر التسليم، شدة المنافسة، مخاطر العميل/الدفع.
- **الجاذبية التجارية**: قيمة العقد غالباً غير مفصح عنها في الكراسات الحكومية. قدّرها من حجم المخرجات وعدد الفريق المطلوب والمدة، وصرّح بأنها تقديرية ومبنية على المقارنة بعقود مماثلة.

قواعد صارمة:
- لا تخترع رقماً أو مرجعاً أو اسم منافس لم يرد في المدخلات أو لا يكون معقولاً ومصرّحاً بأنه تقديري.
- كل معلومة جوهرية غائبة عن الكراسة تُدرج في consultant_opinion.missing_information.
- الدرجات من 0 إلى 10، وكن تمييزياً: لا تمنح درجات متقاربة لكل المعايير.
- درجة المخاطر معكوسة: مخاطر أقل = درجة أعلى.
- اكتب بالعربية الفصحى المناسبة لعرض تنفيذي. لا عناوين Markdown ولا رموز تنسيق.

لا تحسب الدرجة الإجمالية ولا تحدد قرار المشاركة — يُحسبان خارج النموذج من الأوزان الرسمية.`;

const PROFILE_SYSTEM = `أنت محلل أبحاث في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية).
مهمتك: بناء ملف تعريفي موجز عن الجهة المصدرة لكراسة الشروط، اعتماداً على البحث في المصادر العامة.

غطِّ ما استطعت من: طبيعة الجهة ومالكها أو الجهة الأم، حجمها ونطاق عملها، موقعها ضمن رؤية 2030 إن وُجد، مشاريعها أو تعاقداتها الاستشارية المعلنة، وأي إشارات عن أسلوبها في التعاقد ومن سبق أن تعاقدت معه.

قواعد صارمة:
- اعتمد على نتائج البحث فقط. لا تخترع حقائق أو أرقاماً.
- إذا لم تجد معلومة موثوقة عن جانب ما، اذكر صراحة أنها غير متوفرة.
- ميّز بوضوح بين ما هو مؤكد من مصدر وما هو استنتاج مرجّح.
- اكتب بالعربية، بفقرات قصيرة، دون عناوين Markdown.`;

/* ---------------- Hijri deadline ----------------

   Saudi tenders date everything in Hijri (HRDF closes 09/01/1448). The days-
   remaining figure is the highest-weighted risk factor in these assessments,
   so it's computed here between extraction and judgement and handed to the
   model — never left for the model to work out. Umm al-Qura via Intl, the
   civil calendar Etimad issues dates in. admin/js/modules/agent/hijri.js
   holds a parallel copy for re-checking freshness when an old assessment is
   reopened; Edge Functions can't import from the admin bundle. */

const UMALQURA = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
  year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
});
const DAY_MS = 86400000;

function toHijriParts(date: Date) {
  const parts = UMALQURA.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date | null {
  const estimate = Math.floor((hYear - 1) * 354.367) + Math.floor((hMonth - 1) * 29.531) + (hDay - 1);
  let guess = new Date(Date.UTC(622, 6, 19) + estimate * DAY_MS);

  for (let i = 0; i < 12; i++) {
    const h = toHijriParts(guess);
    const drift = (hYear - h.year) * 354.367 + (hMonth - h.month) * 29.531 + (hDay - h.day);
    if (Math.abs(drift) < 1) break;
    guess = new Date(guess.getTime() + Math.round(drift) * DAY_MS);
  }
  for (let offset = -5; offset <= 5; offset++) {
    const candidate = new Date(guess.getTime() + offset * DAY_MS);
    const h = toHijriParts(candidate);
    if (h.year === hYear && h.month === hMonth && h.day === hDay) return candidate;
  }
  return null; // Never guess a deadline; a wrong one is worse than none.
}

function resolveDeadline(raw: string, calendar: string) {
  if (!raw) return null;
  const normalized = String(raw).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const nums = (normalized.match(/\d+/g) || []).map(Number);
  const yearIndex = nums.findIndex((n) => n >= 1300 && n <= 1600);

  let date: Date | null = null;
  let hijri: string | null = null;

  if (calendar !== "gregorian" && yearIndex !== -1 && nums.length >= 3) {
    const year = nums[yearIndex];
    const rest = nums.filter((_, i) => i !== yearIndex);
    const [day, month] = yearIndex === 0 ? [rest[1], rest[0]] : [rest[0], rest[1]];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 30) {
      date = hijriToGregorian(year, month, day);
      hijri = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    }
  } else {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) return { hijri, gregorian: null, days_remaining: null };

  const today = new Date();
  const days = Math.round(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / DAY_MS,
  );
  return { hijri, gregorian: date.toISOString().slice(0, 10), days_remaining: days };
}

/* ---------------- helpers ---------------- */

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

// Server tools can hand the turn back with stop_reason "pause_turn" before
// they're done; continue the same turn rather than treating it as the answer.
async function runWithServerTools(params: Record<string, unknown>, maxContinues = 3) {
  // deno-lint-ignore no-explicit-any
  let response: any = await anthropic.beta.messages.create(params as any);
  const messages = [...(params.messages as unknown[])];

  for (let i = 0; i < maxContinues && response.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: response.content });
    // deno-lint-ignore no-explicit-any
    response = await anthropic.beta.messages.create({ ...params, messages } as any);
  }
  return response;
}

async function structured(system: string, user: string, schema: unknown, maxTokens: number) {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
    // deno-lint-ignore no-explicit-any
  } as any);

  if (response.stop_reason === "refusal") throw new Error("refusal");
  const raw = textOf(response.content);
  if (!raw) throw new Error("empty response");
  return { parsed: JSON.parse(raw), model: response.model };
}

async function profileEntity(entityName: string, rfpExcerpt: string) {
  const response = await runWithServerTools({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    system: PROFILE_SYSTEM,
    messages: [{
      role: "user",
      content: `الجهة المصدرة: ${entityName}\n\nمقتطف من كراسة الشروط للسياق:\n${rfpExcerpt}`,
    }],
  });

  if (response.stop_reason === "refusal") return null;
  return textOf(response.content) || null;
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rfpText, entityName, capabilities, skipResearch } = await req.json();

    if (!rfpText || String(rfpText).trim().length < 200) {
      return json({ error: "نص كراسة الشروط مطلوب (200 حرف على الأقل)" }, 400);
    }

    // 1. Facts first — everything downstream depends on these being right.
    const { parsed: extraction } = await structured(
      EXTRACTION_SYSTEM,
      `كراسة الشروط والمواصفات:\n\n${rfpText}`,
      EXTRACTION_SCHEMA,
      8000,
    );

    // Deadline resolved from the extracted Hijri date, before judgement.
    const deadline = resolveDeadline(
      extraction?.dates?.submission_deadline,
      extraction?.dates?.calendar,
    );

    // 2. Research is best-effort.
    let entityProfile: string | null = null;
    let profileError: string | null = null;
    const researchTarget = entityName || extraction?.tender?.issuer;
    if (!skipResearch && researchTarget) {
      try {
        entityProfile = await profileEntity(researchTarget, String(rfpText).slice(0, 4000));
      } catch (err) {
        profileError = String(err);
        console.error("entity profiling failed", err);
      }
    }

    // 3. Judgement, given the facts.
    const { parsed: assessment, model } = await structured(
      ASSESSMENT_SYSTEM,
      JSON.stringify({
        extraction,
        deadline,
        jadara_capabilities: capabilities ?? [],
        entity_profile: entityProfile,
        rfp_text: rfpText,
      }),
      ASSESSMENT_SCHEMA,
      16000,
    );

    return json({
      assessment,
      extraction,
      deadline,
      entity_profile: entityProfile,
      profile_error: profileError,
      model,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("refusal")) {
      return json({ error: "تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج" }, 422);
    }
    console.error("generate-gonogo error", err);
    return json({ error: "حدث خطأ أثناء إعداد التقييم", detail: message }, 500);
  }
});
