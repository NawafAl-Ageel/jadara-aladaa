// Jadara — the profiling agent.
//
// Deep research on any client entity ("وزارة الطاقة", "هيئة التأمين", a PIF
// portfolio company), optionally seeded with whatever material the user
// already has. Everything about a prospective client is useful when writing a
// Go/No-Go or a technical proposal, so this goes wide: mandate, strategy,
// leadership, scale, structure, procurement behaviour, maturity signals,
// recent developments — and where Jadara's services actually fit.
//
// Runs as a background job. A thorough run makes many searches and takes
// minutes, well past the window a function may hold a request open, so the
// handler writes a `researching` row, returns its id, and continues work via
// EdgeRuntime.waitUntil. Failures are written back to the row: a background
// run that dies silently would leave a profile that never arrives and never
// explains why.
//
// ANTHROPIC_API_KEY is read only here, from Supabase secrets.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

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

/* ---------------- schema ---------------- */

const str = { type: "string" };
const strArray = { type: "array", items: { type: "string" } };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arrayOf = (items: unknown) => ({ type: "array", items });

const PROFILE_SCHEMA = obj({
  identity: obj({
    legal_name: str,
    name_en: str,
    aliases: strArray,
    entity_type: str,
    parent_entity: str,
    established: str,
    headquarters: str,
    website: str,
  }),
  mandate: obj({
    summary: str,
    sectors: strArray,
    regulatory_remit: str,
    services_provided: strArray,
  }),
  strategy: obj({
    vision_2030_alignment: str,
    published_strategy: str,
    programs: strArray,
    stated_targets: strArray,
    stated_challenges: strArray,
  }),
  leadership: arrayOf(obj({ name: str, title: str, note: str })),
  scale: obj({ budget: str, staff_size: str, branches: str, beneficiaries: str }),
  structure: obj({ departments: strArray, subsidiaries: strArray, affiliated_entities: strArray }),
  procurement: obj({
    platform: str,
    observed_tenders: arrayOf(obj({ title: str, reference: str, date: str, note: str })),
    typical_scope: strArray,
    known_suppliers: strArray,
    contracting_notes: str,
  }),
  maturity_signals: obj({
    certifications: strArray,
    excellence_awards: strArray,
    digital_initiatives: strArray,
    notes: str,
  }),
  recent_developments: arrayOf(obj({ date: str, headline: str, relevance: str })),
  consulting_entry_points: arrayOf(obj({ need: str, jadara_service: str, rationale: str })),
  relationship_notes: str,
  unverified: strArray,
  sources: arrayOf(obj({ title: str, url: str, used_for: str })),
});

/* ---------------- prompts ---------------- */

const RESEARCH_SYSTEM = `أنت محلل أبحاث أول في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية). مهمتك بناء ملف استخباراتي شامل عن جهة يُحتمل أن تكون عميلاً، لاستخدامه في قرارات المشاركة في المناقصات وفي إعداد العروض الفنية.

خذ وقتك. ابحث على عدة جولات ولا تكتفِ بأول نتيجة: ابدأ بالهوية الرسمية، ثم وسّع إلى الاستراتيجية والهيكل والمشتريات والأخبار الحديثة. ابحث بالعربية والإنجليزية، وجرّب صيغ الاسم المختلفة والاختصارات.

غطِّ قدر ما تستطيع:
- الهوية: الاسم النظامي، النوع (وزارة / هيئة / صندوق / شركة تابعة)، الجهة الأم أو المالك، تاريخ التأسيس، المقر، الموقع الرسمي.
- الاختصاص: المهام النظامية، القطاعات، الصلاحيات التنظيمية، الخدمات المقدمة.
- الاستراتيجية: الارتباط برؤية 2030، الاستراتيجية المنشورة، البرامج والمبادرات، المستهدفات المعلنة، والتحديات التي صرّحت بها الجهة نفسها.
- القيادة: الأسماء والمناصب المعلنة رسمياً فقط.
- الحجم: الميزانية إن نُشرت، عدد الموظفين، الفروع، المستفيدون.
- الهيكل: الإدارات والوكالات والشركات التابعة والجهات المرتبطة.
- المشتريات: المنصة المستخدمة (اعتماد غالباً)، المنافسات التي طرحتها سابقاً وطبيعتها، الموردون أو الاستشاريون المعروفون، وأي أنماط في أسلوب التعاقد.
- مؤشرات النضج: شهادات الآيزو، المشاركة في جوائز التميز (الملك عبدالعزيز للجودة / EFQM)، مبادرات التحول الرقمي والحوكمة.
- التطورات الحديثة: إعادة هيكلة، تعيينات، مبادرات جديدة، مع بيان أهميتها لنا.
- مداخل استشارية: أين تلتقي احتياجات الجهة مع خدمات جَدارة (الحوكمة والمخاطر والامتثال، الجودة وتدقيق الآيزو، التميز المؤسسي وتقييم النضج، استمرارية الأعمال، تطوير المنهجيات، بناء القدرات).

قواعد صارمة:
- كل معلومة يجب أن تستند إلى نتيجة بحث فعلية. لا تخترع اسماً أو رقماً أو ميزانية أو منافسة.
- إذا تعذّر إثبات معلومة، أدرجها في "unverified" بدل تخمينها. الملف الناقص الصادق أنفع من ملف كامل مُختلق.
- انتبه لتشابه الأسماء: تأكد أنك تبحث عن الجهة الصحيحة في السعودية تحديداً، وإن كان هناك التباس فصرّح به.
- إن زوّدك المستخدم بمواد خاصة، اعتبرها مصدراً موثوقاً وابنِ عليها، وميّز ما جاء منها عمّا وجدته علناً.
- اكتب بالعربية الفصحى. لا عناوين Markdown.`;

/* ---------------- helpers ---------------- */

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

function countSearches(content: Array<{ type: string }>): number {
  return content.filter((b) => b.type === "web_search_tool_result").length;
}

/* Every call here streams. A deep research turn can run for many minutes, and
   the SDK refuses a non-streaming request whose max_tokens could exceed its
   ten-minute ceiling — which is exactly what this function's token budgets do.
   finalMessage() gives back the same Message shape as a plain create(), so
   stop_reason and content are read identically downstream. */
// deno-lint-ignore no-explicit-any
async function createMessage(params: Record<string, unknown>): Promise<any> {
  // deno-lint-ignore no-explicit-any
  const stream = anthropic.beta.messages.stream(params as any);
  return await stream.finalMessage();
}

// Server tools hand the turn back with stop_reason "pause_turn" mid-research;
// continuing the same turn is what lets a run go deep instead of stopping at
// whatever it had when the first window closed.
type Progress = (note: string, searches: number) => Promise<void>;

async function researchLoop(params: Record<string, unknown>, onProgress: Progress, maxContinues = 8) {
  let response = await createMessage(params);
  const messages = [...(params.messages as unknown[])];
  let searches = countSearches(response.content);
  await onProgress(`جولة البحث 1`, searches);

  for (let i = 0; i < maxContinues && response.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: response.content });
    response = await createMessage({ ...params, messages });
    searches += countSearches(response.content);
    await onProgress(`جولة البحث ${i + 2}`, searches);
  }
  return { response, searches };
}

async function runResearch(
  entityName: string,
  aliases: string[],
  context: string | null,
  onProgress: Progress,
) {
  const hints = [
    `الجهة المطلوب بحثها: ${entityName}`,
    aliases?.length ? `أسماء أخرى محتملة: ${aliases.join("، ")}` : "",
    context ? `\n\nمواد زوّدنا بها المستخدم (اعتبرها مصدراً موثوقاً):\n${context}` : "",
  ].filter(Boolean).join("\n");

  const { response, searches } = await researchLoop({
    model: MODEL,
    max_tokens: 32000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "high" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 30 }],
    system: RESEARCH_SYSTEM,
    messages: [{ role: "user", content: hints }],
  }, onProgress);

  if (response.stop_reason === "refusal") throw new Error("refusal");
  const findings = textOf(response.content);
  if (!findings) throw new Error("البحث لم يُرجع نتائج");

  await onProgress("ترتيب النتائج في ملف منظّم", searches);

  // Structuring is a separate pass: the research turn needs tools and room to
  // roam, and forcing a JSON schema onto it would constrain the search itself.
  const shaped = await createMessage({
    model: MODEL,
    max_tokens: 24000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: PROFILE_SCHEMA } },
    system: RESEARCH_SYSTEM,
    messages: [{
      role: "user",
      content: `${hints}\n\nنتائج البحث التي جمعتها:\n\n${findings}\n\nحوّلها إلى JSON حسب المخطط. لا تضف معلومة لم ترد أعلاه، وضع كل ما لم يثبت في "unverified".`,
    }],
  });

  if (shaped.stop_reason === "refusal") throw new Error("refusal");
  const raw = textOf(shaped.content);
  if (!raw) throw new Error("لم يُرجع النموذج محتوى");

  return { profile: JSON.parse(raw), searches, model: shaped.model };
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { profileId } = await req.json();
    if (!profileId) return json({ error: "profileId مطلوب" }, 400);

    // Service role: the background task outlives the request, so it can't rely
    // on the caller's forwarded JWT still being in play when it writes back.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await admin
      .from("entity_profiles").select("*").eq("id", profileId).single();
    if (error || !row) return json({ error: "لم يتم العثور على الطلب" }, 404);
    if (row.status === "researching" || row.status === "done") {
      return json({ status: row.status, id: row.id });
    }

    // Caught here rather than deep in the SDK, where it surfaces as "Could not
    // resolve authentication method" — true, but it doesn't tell you the
    // project is missing a secret.
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      await admin.from("entity_profiles").update({
        status: "failed",
        error: "مفتاح ANTHROPIC_API_KEY غير مضبوط في أسرار هذا المشروع في Supabase.",
        completed_at: new Date().toISOString(),
      }).eq("id", profileId);
      return json({ error: "مفتاح ANTHROPIC_API_KEY غير مضبوط في هذا المشروع" }, 503);
    }

    await admin.from("entity_profiles").update({
      status: "researching",
      started_at: new Date().toISOString(),
      error: null,
      progress_note: "بدء البحث",
      search_count: 0,
    }).eq("id", profileId);

    const onProgress = async (note: string, searches: number) => {
      await admin.from("entity_profiles")
        .update({ progress_note: note, search_count: searches })
        .eq("id", profileId);
    };

    const work = (async () => {
      try {
        const { profile, searches, model } = await runResearch(
          row.entity_name, row.aliases || [], row.provided_context, onProgress,
        );
        await admin.from("entity_profiles").update({
          status: "done",
          profile,
          sources: profile.sources || [],
          search_count: searches,
          progress_note: null,
          generated_by_model: model,
          completed_at: new Date().toISOString(),
        }).eq("id", profileId);
      } catch (err) {
        const message = String(err);
        await admin.from("entity_profiles").update({
          status: "failed",
          error: message.includes("refusal")
            ? "تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج"
            : message,
          completed_at: new Date().toISOString(),
        }).eq("id", profileId);
      }
    })();

    // Keeps the runtime alive past the response so a deep run isn't cut off.
    // @ts-ignore EdgeRuntime is provided by the Supabase Edge Function runtime.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      await work; // Local/dev fallback.
    }

    return json({ status: "researching", id: profileId });
  } catch (err) {
    console.error("profile-entity error", err);
    return json({ error: "تعذر بدء البحث", detail: String(err) }, 500);
  }
});
