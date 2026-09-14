// Jadara — the agent researches its own firm.
//
// Counterpart to the client-entity research in generate-gonogo, with one
// deliberate asymmetry: this one is explicit about what it could NOT find.
//
// Public sources establish services, accreditations, published clients and
// positioning. They cannot establish how many consultants hold an EFQM
// assessor certificate, or who is free for an 8-month on-site deployment —
// and those decide the tenders in hand. Anything in that category belongs in
// `limitations`, never invented into `accreditations`, so the requirement-
// match table keeps scoring it "unknown" until a human confirms it.
//
// Results are written to jadara_profile / jadara_capabilities by the caller
// as UNVERIFIED. ANTHROPIC_API_KEY is read only here, from Supabase secrets.

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

const str = { type: "string" };
const strArray = { type: "array", items: { type: "string" } };

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    legal_name: str,
    summary: str,
    services: strArray,
    accreditations: strArray,
    published_clients: strArray,
    positioning: str,
    capability_areas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: str,
          role: str,
          certifications: strArray,
          evidence: str,
          source_url: str,
        },
        required: ["area", "role", "certifications", "evidence", "source_url"],
        additionalProperties: false,
      },
    },
    limitations: strArray,
    sources: strArray,
  },
  required: [
    "legal_name", "summary", "services", "accreditations", "published_clients",
    "positioning", "capability_areas", "limitations", "sources",
  ],
  additionalProperties: false,
};

const SYSTEM = `أنت محلل أبحاث يبني ملفاً تعريفياً عن شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية) اعتماداً على المصادر العامة فقط.

ابحث بالعربية والإنجليزية، وابدأ بالموقع الرسمي للشركة إن وُجد، ثم السجلات التجارية والمنصات المهنية والأخبار والمنصات الحكومية (اعتماد) وأي مشاريع أو عملاء معلنين.

ما يُتوقع أن تجده ويُدرج في الحقول:
- services: الخدمات الاستشارية المعلنة.
- accreditations: الاعتمادات والشهادات المعلنة **للشركة كمنشأة** (مثل اعتماد جهة تدريب، شراكة مع جهة منح، شهادات آيزو للشركة نفسها).
- published_clients: العملاء أو المشاريع المعلنة صراحةً في مصدر عام.
- positioning: كيف تقدّم الشركة نفسها في السوق، وحجمها إن ذُكر.
- capability_areas: مجالات الممارسة المستنتجة من الخدمات المعلنة، مع رابط المصدر لكل منها.

**تحذير جوهري — لا تخترق هذا الحد:**
لا تستنتج ولا تقدّر أبداً: عدد الموظفين أو المستشارين، عدد من يحملون شهادة معينة (مثل مقيّم EFQM أو مقيّم KAQA)، نسبة السعودة، أو مدى توفر الفريق للانتداب. هذه المعلومات لا تُنشر علناً، وهي بالذات ما يحسم المناقصات محل التقييم. إن لم تجدها في مصدر صريح، أدرجها في "limitations" بصيغة واضحة تبيّن أنها تحتاج تأكيداً داخلياً — ولا تضعها في accreditations أو capability_areas.

قواعد صارمة:
- كل ادعاء يجب أن يستند إلى نتيجة بحث فعلية، مع رابط في sources.
- إن لم تجد الشركة أصلاً أو كانت النتائج غامضة (تشابه الأسماء)، قل ذلك صراحة في summary وlimitations بدل تقديم ملف مُختلق.
- ميّز بين ما هو منشور رسمياً وما هو استنتاج مرجّح.
- اكتب بالعربية. لا عناوين Markdown.
أرجع JSON حسب المخطط فقط.`;

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

// Server tools can hand the turn back with stop_reason "pause_turn" before
// they're done; continue the same turn rather than treating it as the answer.
async function runWithServerTools(params: Record<string, unknown>, maxContinues = 4) {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const website = body?.website || "jadara-aladaa.sa";
    const companyName = body?.companyName || "جَدارة الأداء للاستشارات الإدارية";

    // Search and structured output are separate passes: the search turn needs
    // tools, and stacking a JSON-schema constraint onto a tool-using turn is
    // an unnecessary risk when the two-step version is just as cheap.
    const research = await runWithServerTools({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `ابحث عن: ${companyName}\nالموقع المتوقع: ${website}\n\nاجمع كل ما يمكن التحقق منه من مصادر عامة، ثم صرّح بما لم تستطع إثباته.`,
      }],
    });

    if (research.stop_reason === "refusal") {
      return json({ error: "تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج" }, 422);
    }

    const findings = textOf(research.content);
    if (!findings) return json({ error: "لم يُرجع البحث أي نتائج" }, 502);

    const shaped = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: PROFILE_SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `نتائج البحث التي جمعتها:\n\n${findings}\n\nحوّلها إلى JSON حسب المخطط، مع الالتزام الكامل بحد "لا تستنتج الأعداد أو الشهادات الفردية".`,
      }],
      // deno-lint-ignore no-explicit-any
    } as any);

    if (shaped.stop_reason === "refusal") {
      return json({ error: "تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج" }, 422);
    }

    const raw = textOf(shaped.content);
    if (!raw) return json({ error: "لم يُرجع النموذج محتوى" }, 502);

    return json({ profile: JSON.parse(raw), model: shaped.model });
  } catch (err) {
    console.error("research-jadara error", err);
    return json({ error: "حدث خطأ أثناء البحث", detail: String(err) }, 500);
  }
});
