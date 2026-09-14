// Jadara — Go/No-Go assessment generator.
//
// Two deliberate calls, not one:
//   1. Entity profile via web search — the client usually won't hand us data
//      about themselves, so the agent researches them.
//   2. The assessment itself via structured output, given the RFP + that profile.
//
// They stay separate so the research is auditable on its own (it's stored on
// the assessment row), and so a research failure degrades to "assess without a
// profile" instead of losing the whole run.
//
// The historical per-criterion averages are deliberately NOT sent to the model.
// Showing it "past assessments averaged 6.47 here" would anchor its score to
// the mean; the benchmark is a presentation-layer join, computed in SQL from
// gonogo_criteria_averages after the scores exist.
//
// ANTHROPIC_API_KEY is read only here, from Supabase's secret store.

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

/* ---------------- assessment schema ---------------- */

const str = { type: "string" };
const strArray = { type: "array", items: { type: "string" } };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

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
    workstreams: {
      type: "array",
      items: obj({ title: str, description: str }),
    },
    deliverables: {
      type: "array",
      items: obj({ name: str, quantity: str }),
    },
    stakeholders: strArray,
  }),
  strategic_alignment: obj({
    score: { type: "number" },
    rows: { type: "array", items: obj({ dimension: str, assessment: str, rating: str }) },
  }),
  capabilities: obj({
    score: { type: "number" },
    rows: { type: "array", items: obj({ dimension: str, level: str, assessment: str }) },
    gaps: strArray,
  }),
  commercial: obj({
    score: { type: "number" },
    estimated_value_min: { type: "number" },
    estimated_value_max: { type: "number" },
    profit_margin_min: { type: "number" },
    profit_margin_max: { type: "number" },
    team_size: str,
    duration: str,
    analysis: strArray,
    long_term_value: strArray,
  }),
  risks: obj({
    score: { type: "number" },
    matrix: {
      type: "array",
      items: obj({
        category: str,
        level: { type: "string", enum: ["red", "amber", "green"] },
        assessment: str,
        mitigation: str,
      }),
    },
    overall_note: str,
  }),
  competitive: obj({
    score: { type: "number" },
    win_probability_min: { type: "number" },
    win_probability_max: { type: "number" },
    competitors: strArray,
    jadara_advantages: strArray,
    strengths: strArray,
    weaknesses: strArray,
    decisive_factor: str,
  }),
  recommendation: obj({
    why_suitable: strArray,
    conditions: strArray,
    immediate_steps: { type: "array", items: obj({ when: str, action: str }) },
  }),
  consultant_opinion: obj({
    verdict_line: str,
    prose: strArray,
    missing_information: strArray,
  }),
});

/* ---------------- prompts ---------------- */

const PROFILE_SYSTEM = `أنت محلل أبحاث في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية).
مهمتك: بناء ملف تعريفي موجز عن الجهة المصدرة لكراسة الشروط، اعتماداً على البحث في المصادر العامة.

غطِّ ما استطعت من: طبيعة الجهة ومالكها أو الجهة الأم، حجمها ونطاق عملها، موقعها ضمن رؤية 2030 إن وُجد،
مشاريعها أو تعاقداتها الاستشارية المعلنة، وأي إشارات عن أسلوبها في التعاقد.

قواعد صارمة:
- اعتمد على نتائج البحث فقط. لا تخترع حقائق أو أرقاماً.
- إذا لم تجد معلومة موثوقة عن جانب ما، اذكر صراحة أنها غير متوفرة.
- ميّز بوضوح بين ما هو مؤكد من مصدر وما هو استنتاج مرجّح.
- اكتب بالعربية، بفقرات قصيرة، دون عناوين Markdown.`;

const ASSESSMENT_SYSTEM = `أنت مستشار أول في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية)، تُعدّ تقييم قرار المشاركة/عدم المشاركة (Go/No-Go) لفرصة مطروحة.

خلفية عن جَدارة (استخدمها في تقييم التوافق):
- كفاءات أساسية: الحوكمة وإدارة المخاطر والامتثال (GRC)، إدارة الجودة وتدقيق الآيزو، التميز المؤسسي وتقييم النضج،
  استمرارية الأعمال (BCM/DRP)، تطوير المنهجيات والأطر التنظيمية، بناء القدرات والتدريب.
- السوق الرئيسي: القطاع الحكومي وشبه الحكومي السعودي وكيانات رؤية 2030.
- مزايا تنافسية: حضور محلي سعودي، تسعير تنافسي مقارنة بشركات الأربعة الكبار، تسليم بالعربية، مرونة وسرعة تعبئة الفريق.
- نقاط ضعف متكررة: قوة العلامة التجارية مقارنة بالأربعة الكبار، ومحدودية المراجع في بعض التخصصات الدقيقة.

قواعد صارمة:
- اعتمد على نص كراسة الشروط وملف الجهة المرفقين فقط. لا تخترع أرقاماً أو مراجع أو أسماء منافسين غير واردة أو غير معقولة.
- كل قيمة تقديرية (قيمة العقد، هامش الربح، احتمالية الفوز) يجب أن تكون تقديراً مبرراً بالنطاق والمدة، واذكر أنها تقديرية.
- إذا كانت معلومة جوهرية غائبة عن الكراسة (قيمة العقد، أوزان التقييم، عدد الإدارات)، أدرجها في missing_information ولا تفترضها.
- درجات التقييم من 0 إلى 10. كن صادقاً وتمييزياً: لا تمنح درجات متقاربة لكل شيء، وميّز نقاط الضعف بوضوح.
- درجة المخاطر (risks.score) معكوسة: مخاطر أقل = درجة أعلى.
- مصفوفة المخاطر تغطي: غموض النطاق، ضيق المهلة، متطلبات الامتثال، فجوات الخبرة، مخاطر الموارد، مخاطر التسليم، شدة المنافسة، مخاطر العميل/الدفع.
- اكتب بالعربية الفصحى المناسبة لعرض تنفيذي للإدارة العليا. لا تستخدم عناوين Markdown أو رموز تنسيق.

لا تحسب الدرجة الإجمالية ولا تحدد قرار المشاركة — يُحسبان خارج النموذج من الأوزان الرسمية.`;

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
    const { rfpText, entityName, skipResearch } = await req.json();

    if (!rfpText || String(rfpText).trim().length < 200) {
      return json({ error: "نص كراسة الشروط مطلوب (200 حرف على الأقل)" }, 400);
    }

    // Research is best-effort: a failure here must not lose the assessment.
    let entityProfile: string | null = null;
    let profileError: string | null = null;
    if (!skipResearch && entityName) {
      try {
        entityProfile = await profileEntity(entityName, String(rfpText).slice(0, 4000));
      } catch (err) {
        profileError = String(err);
        console.error("entity profiling failed", err);
      }
    }

    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: ASSESSMENT_SCHEMA },
      },
      system: ASSESSMENT_SYSTEM,
      messages: [{
        role: "user",
        content: [
          entityName ? `الجهة المصدرة: ${entityName}` : "",
          entityProfile ? `\n\nملف تعريفي عن الجهة (من بحث في المصادر العامة):\n${entityProfile}` : "",
          `\n\nنص كراسة الشروط / طلب تقديم العروض:\n${rfpText}`,
        ].join(""),
      }],
      // deno-lint-ignore no-explicit-any
    } as any);

    if (response.stop_reason === "refusal") {
      return json({ error: "تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج" }, 422);
    }

    const raw = textOf(response.content);
    if (!raw) return json({ error: "لم يُرجع النموذج محتوى" }, 502);

    let assessment;
    try {
      assessment = JSON.parse(raw);
    } catch {
      return json({ error: "تعذر قراءة مخرجات النموذج بصيغة JSON" }, 502);
    }

    return json({
      assessment,
      entity_profile: entityProfile,
      profile_error: profileError,
      model: response.model,
    });
  } catch (err) {
    console.error("generate-gonogo error", err);
    return json({ error: "حدث خطأ أثناء إعداد التقييم", detail: String(err) }, 500);
  }
});
