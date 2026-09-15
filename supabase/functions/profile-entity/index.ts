// Jadara — the profiling agent.
//
// Deep research on any client entity ("وزارة الطاقة", "هيئة التأمين", a PIF
// portfolio company), optionally seeded with material the user already has.
// Everything about a prospective client is useful when writing a Go/No-Go or a
// technical proposal, so this goes wide: mandate, strategy, leadership, scale,
// structure, procurement behaviour, maturity signals, recent developments —
// and where Jadara's services actually fit.
//
// ONE INVOCATION = ONE ROUND.
//
// An Edge Function invocation has a wall-clock ceiling of a few minutes, and
// EdgeRuntime.waitUntil extends work past the response but NOT past that
// ceiling. An earlier version tried to do the whole run in one background task
// and was killed silently at around the fifteen-minute mark — the row simply
// stopped changing. So each invocation now does a single model turn, persists
// the conversation, and chains to the next round. Every round finishes well
// inside the ceiling while the run overall takes as long as it needs, and it
// keeps going whether or not anyone has the page open.
//
// ANTHROPIC_API_KEY is read only here, from Supabase secrets.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

// Bounds the run. Each round makes at most SEARCHES_PER_ROUND searches, so the
// ceiling on total research is MAX_ROUNDS x SEARCHES_PER_ROUND.
const MAX_ROUNDS = 12;
const SEARCHES_PER_ROUND = 4;

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
    legal_name: str, name_en: str, aliases: strArray, entity_type: str,
    parent_entity: str, established: str, headquarters: str, website: str,
  }),
  mandate: obj({
    summary: str, sectors: strArray, regulatory_remit: str, services_provided: strArray,
  }),
  strategy: obj({
    vision_2030_alignment: str, published_strategy: str, programs: strArray,
    stated_targets: strArray, stated_challenges: strArray,
  }),
  leadership: arrayOf(obj({ name: str, title: str, note: str })),
  scale: obj({ budget: str, staff_size: str, branches: str, beneficiaries: str }),
  structure: obj({ departments: strArray, subsidiaries: strArray, affiliated_entities: strArray }),
  procurement: obj({
    platform: str,
    observed_tenders: arrayOf(obj({ title: str, reference: str, date: str, note: str })),
    typical_scope: strArray, known_suppliers: strArray, contracting_notes: str,
  }),
  maturity_signals: obj({
    certifications: strArray, excellence_awards: strArray,
    digital_initiatives: strArray, notes: str,
  }),
  recent_developments: arrayOf(obj({ date: str, headline: str, relevance: str })),
  consulting_entry_points: arrayOf(obj({ need: str, jadara_service: str, rationale: str })),
  relationship_notes: str,
  unverified: strArray,
  sources: arrayOf(obj({ title: str, url: str, used_for: str })),
});

/* ---------------- prompts ---------------- */

const RESEARCH_SYSTEM = `أنت محلل أبحاث أول في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية). مهمتك بناء ملف استخباراتي شامل عن جهة يُحتمل أن تكون عميلاً، لاستخدامه في قرارات المشاركة في المناقصات وفي إعداد العروض الفنية.

يجري البحث على جولات متتابعة. في كل جولة لديك عدد محدود من عمليات البحث، فاختر ما تبحث عنه بعناية وابنِ على ما جمعته في الجولات السابقة بدل تكراره. رتّب أولوياتك هكذا:
1) الهوية الرسمية والاختصاص. 2) الاستراتيجية والارتباط برؤية 2030. 3) الهيكل والقيادة والحجم. 4) المشتريات والمنافسات السابقة والموردون. 5) مؤشرات النضج والتطورات الحديثة.

غطِّ قدر ما تستطيع:
- الهوية: الاسم النظامي، النوع (وزارة / هيئة / صندوق / شركة تابعة)، الجهة الأم أو المالك، التأسيس، المقر، الموقع الرسمي.
- الاختصاص: المهام النظامية، القطاعات، الصلاحيات التنظيمية، الخدمات المقدمة.
- الاستراتيجية: الارتباط برؤية 2030، الاستراتيجية المنشورة، البرامج والمبادرات، المستهدفات، والتحديات التي صرّحت بها الجهة نفسها.
- القيادة: الأسماء والمناصب المعلنة رسمياً فقط.
- الحجم: الميزانية إن نُشرت، عدد الموظفين، الفروع، المستفيدون.
- الهيكل: الإدارات والوكالات والشركات التابعة والجهات المرتبطة.
- المشتريات: المنصة (اعتماد غالباً)، المنافسات السابقة وطبيعتها، الموردون أو الاستشاريون المعروفون، وأنماط التعاقد.
- مؤشرات النضج: شهادات الآيزو، المشاركة في جوائز التميز (الملك عبدالعزيز للجودة / EFQM)، مبادرات التحول الرقمي والحوكمة.
- التطورات الحديثة مع بيان أهميتها لنا.
- مداخل استشارية: أين تلتقي احتياجات الجهة مع خدمات جَدارة (الحوكمة والمخاطر والامتثال، الجودة وتدقيق الآيزو، التميز المؤسسي وتقييم النضج، استمرارية الأعمال، تطوير المنهجيات، بناء القدرات).

ابحث بالعربية والإنجليزية وجرّب صيغ الاسم والاختصارات.

قواعد صارمة:
- كل معلومة تستند إلى نتيجة بحث فعلية. لا تخترع اسماً أو رقماً أو ميزانية أو منافسة.
- ما تعذّر إثباته يُذكر صراحة بوصفه غير مؤكد. الملف الناقص الصادق أنفع من ملف كامل مُختلق.
- انتبه لتشابه الأسماء: تأكد أنك تبحث عن الجهة الصحيحة في السعودية تحديداً، وإن كان هناك التباس فصرّح به.
- إن زوّدك المستخدم بمواد خاصة، اعتبرها مصدراً موثوقاً وميّز ما جاء منها عمّا وجدته علناً.
- اكتب بالعربية الفصحى. لا عناوين Markdown.

عندما ترى أنك غطّيت ما يمكن تغطيته ولم يعد البحث يضيف جديداً، اكتب في نهاية ردك السطر: ANTHESEARCH_COMPLETE`;

/* ---------------- helpers ---------------- */

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

function countSearches(content: Array<{ type: string }>): number {
  return content.filter((b) => b.type === "web_search_tool_result").length;
}

/* Streams every call. The SDK refuses a non-streaming request whose max_tokens
   could exceed its ten-minute ceiling, and finalMessage() returns the same
   Message shape so stop_reason and content read identically. */
// deno-lint-ignore no-explicit-any
async function createMessage(params: Record<string, unknown>): Promise<any> {
  // deno-lint-ignore no-explicit-any
  const stream = anthropic.beta.messages.stream(params as any);
  return await stream.finalMessage();
}

function buildPrompt(row: Record<string, unknown>) {
  return [
    `الجهة المطلوب بحثها: ${row.entity_name}`,
    (row.aliases as string[])?.length ? `أسماء أخرى محتملة: ${(row.aliases as string[]).join("، ")}` : "",
    row.provided_context
      ? `\n\nمواد زوّدنا بها المستخدم (اعتبرها مصدراً موثوقاً):\n${row.provided_context}`
      : "",
  ].filter(Boolean).join("\n");
}

/* Chains the next round. Fire-and-forget on purpose: awaiting it would nest
   each round's wall clock inside the previous one and hit the very ceiling
   this design exists to avoid. */
function chainNextRound(profileId: number) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/profile-entity`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ profileId }),
  }).catch((err) => console.error("chain failed", err));
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let profileId: number | null = null;

  const fail = async (message: string, status = 500) => {
    if (profileId) {
      await admin.from("entity_profiles").update({
        status: "failed", error: message, completed_at: new Date().toISOString(),
      }).eq("id", profileId);
    }
    return json({ error: message }, status);
  };

  try {
    const body = await req.json();
    profileId = body?.profileId ?? null;
    if (!profileId) return json({ error: "profileId مطلوب" }, 400);

    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      // Caught here rather than deep in the SDK, where it surfaces as "Could
      // not resolve authentication method" — true, but it doesn't tell you the
      // project is missing a secret.
      return await fail("مفتاح ANTHROPIC_API_KEY غير مضبوط في أسرار هذا المشروع في Supabase.", 503);
    }

    const { data: row, error } = await admin
      .from("entity_profiles").select("*").eq("id", profileId).single();
    if (error || !row) return json({ error: "لم يتم العثور على الطلب" }, 404);
    if (row.status === "done" || row.status === "failed") {
      return json({ status: row.status, id: row.id });
    }

    const now = () => new Date().toISOString();
    const conversation = (row.conversation as unknown[]) || [];
    const round = row.round || 0;
    let searches = row.search_count || 0;

    if (round === 0) {
      await admin.from("entity_profiles").update({
        status: "researching", started_at: row.started_at || now(), error: null,
      }).eq("id", profileId);
    }

    /* ---- structuring round ---- */
    if (row.stage === "structuring") {
      await admin.from("entity_profiles")
        .update({ progress_note: "ترتيب النتائج في ملف منظّم", progress_at: now() })
        .eq("id", profileId);

      const findings = conversation
        .filter((m) => (m as { role: string }).role === "assistant")
        .map((m) => textOf((m as { content: [] }).content))
        .filter(Boolean).join("\n\n");

      const shaped = await createMessage({
        model: MODEL,
        max_tokens: 24000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: PROFILE_SCHEMA } },
        system: RESEARCH_SYSTEM,
        messages: [{
          role: "user",
          content: `${buildPrompt(row)}\n\nنتائج البحث التي جمعتها:\n\n${findings}\n\nحوّلها إلى JSON حسب المخطط. لا تضف معلومة لم ترد أعلاه، وضع كل ما لم يثبت في "unverified".`,
        }],
      });

      if (shaped.stop_reason === "refusal") {
        return await fail("تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج", 422);
      }
      const raw = textOf(shaped.content);
      if (!raw) return await fail("لم يُرجع النموذج محتوى", 502);

      const profile = JSON.parse(raw);
      await admin.from("entity_profiles").update({
        status: "done", stage: "complete", profile,
        sources: profile.sources || [], search_count: searches,
        progress_note: null, progress_at: now(),
        generated_by_model: shaped.model, completed_at: now(),
      }).eq("id", profileId);

      return json({ status: "done", id: profileId });
    }

    /* ---- one research round ---- */
    const messages = conversation.length
      ? conversation
      : [{ role: "user", content: buildPrompt(row) }];

    const response = await createMessage({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: SEARCHES_PER_ROUND }],
      system: RESEARCH_SYSTEM,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return await fail("تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج", 422);
    }

    searches += countSearches(response.content);
    const nextRound = round + 1;
    const said = textOf(response.content);
    const finished = said.includes("ANTHESEARCH_COMPLETE") ||
      (response.stop_reason !== "pause_turn" && nextRound > 1 && countSearches(response.content) === 0);
    const exhausted = nextRound >= MAX_ROUNDS;

    const updated = [
      ...messages,
      { role: "assistant", content: response.content },
      // Keeps the turn open for the next invocation without a tool result to
      // reply to; the model continues its own research thread.
      { role: "user", content: "تابع البحث في الجوانب التي لم تغطها بعد." },
    ];

    await admin.from("entity_profiles").update({
      conversation: finished || exhausted ? updated.slice(0, -1) : updated,
      round: nextRound,
      search_count: searches,
      stage: finished || exhausted ? "structuring" : "research",
      progress_note: finished || exhausted
        ? "اكتمل البحث — يُرتَّب الملف الآن"
        : `جولة البحث ${nextRound}`,
      progress_at: now(),
    }).eq("id", profileId);

    chainNextRound(profileId);
    return json({ status: "researching", round: nextRound, searches, id: profileId });
  } catch (err) {
    console.error("profile-entity error", err);
    return await fail(String(err));
  }
});
