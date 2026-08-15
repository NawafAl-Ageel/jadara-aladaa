// Jadara Consulting Studio — Phase 5: AI insights.
// Deno Edge Function. This is the ONLY place ANTHROPIC_API_KEY is ever read —
// it lives in Supabase's project secrets, never in the browser or the repo.
// Supabase enforces a valid user JWT on this endpoint by default (no manual
// auth check needed here), matching the RLS-only access-control model used
// everywhere else in this app.

import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Per-section-kind writing guidance. Falls back to a generic instruction for
// any section_key not listed here (e.g. future template sections).
const SECTION_GUIDANCE: Record<string, string> = {
  executive_summary: "اكتب ملخصاً تنفيذياً موجزاً (٤-٦ جمل) يلخص أهم النتائج المستخلصة من البيانات المعطاة فقط.",
  market_overview: "اكتب نظرة عامة على السوق (٣-٥ جمل) استناداً إلى الأرقام والتوزيعات المعطاة فقط.",
  recommendations: "اكتب ٣-٥ توصيات استراتيجية عملية، كل توصية مرتبطة بحقيقة محددة من البيانات المعطاة.",
  risks: "اكتب ٢-٤ مخاطر محتملة يمكن استنتاجها من البيانات المعطاة (مثل تركز الفرص في جهة أو منطقة واحدة).",
  data_sources: "اكتب فقرة قصيرة (٢-٣ جمل) تصف مصدر البيانات المستخدمة في هذا التقرير بناءً على عدد الصفوف المعطى.",
};

const DEFAULT_GUIDANCE = "اكتب محتوى موجزاً ومناسباً لهذا القسم استناداً إلى البيانات المعطاة فقط.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    body: { type: "string" },
    used_facts: { type: "array", items: { type: "string" } },
  },
  required: ["body", "used_facts"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deliverableName, sectionKey, sectionTitle, language, facts } = await req.json();

    if (!sectionKey || !facts) {
      return new Response(JSON.stringify({ error: "sectionKey و facts مطلوبان" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guidance = SECTION_GUIDANCE[sectionKey] || DEFAULT_GUIDANCE;
    const langInstruction = language === "en"
      ? "Write the section body in English."
      : "اكتب نص القسم باللغة العربية الفصحى المناسبة لتقرير استشاري رسمي.";

    const systemPrompt = [
      "أنت مستشار إداري أول تكتب قسماً واحداً من تقرير تحليل سوق لعميل حقيقي.",
      "قواعد صارمة يجب الالتزام بها دائماً:",
      "- استخدم فقط الحقائق والأرقام المعطاة لك ضمن \"facts\" — لا تخترع أي رقم أو إحصائية غير موجودة فيها.",
      "- لا تذكر أي جهة أو شركة أو منطقة أو تاريخ لم يرد صراحة ضمن \"facts\".",
      "- إذا كانت البيانات المعطاة غير كافية لتغطية جانب معين، اذكر ذلك بوضوح بدلاً من افتراض معلومات غير موجودة.",
      `- ${guidance}`,
      `- ${langInstruction}`,
      "- لا تستخدم عناوين Markdown أو رموز التنسيق (# أو ** إلخ)، فقط نص عادي متصل.",
      "أرجع النتيجة بصيغة JSON حسب المخطط المحدد فقط، حقل body للنص وحقل used_facts بأسماء الحقائق التي استندت إليها فعلاً.",
    ].join("\n");

    const userContent = JSON.stringify({
      deliverable_name: deliverableName,
      section: sectionTitle,
      facts,
    });

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      // Single bounded generation call (not agentic) — medium effort keeps
      // latency/cost reasonable for report-section drafting while staying
      // on the full model, per the "tune effort, don't downgrade model" rule.
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      },
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    if (response.stop_reason === "refusal") {
      return new Response(JSON.stringify({ error: "تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const textBlock = response.content.find((b: { type: string }) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    if (!textBlock) {
      return new Response(JSON.stringify({ error: "لم يتم إرجاع محتوى نصي من النموذج" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(textBlock.text);

    return new Response(JSON.stringify({
      body: parsed.body,
      used_facts: parsed.used_facts,
      model: response.model,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-insight error", err);
    return new Response(JSON.stringify({ error: "حدث خطأ أثناء التوليد بالذكاء الاصطناعي", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
