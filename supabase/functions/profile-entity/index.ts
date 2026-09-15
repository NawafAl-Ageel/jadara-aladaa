// Jadara — the profiling agent, researching via Exa's Agent API.
//
// Deep research on any client entity ("وزارة الطاقة", "هيئة التأمين", a PIF
// portfolio company), optionally seeded with material the user already has.
//
// WHY EXA RUNS THE RESEARCH
//
// The previous version ran the research loop itself with Claude's web_search.
// An Edge Function invocation cannot hold a loop that long — the first real
// run was killed at around fifteen minutes with the row stuck on
// "researching" — which forced the round-chaining machinery in 014 and was
// still slow. Exa runs the loop on its own infrastructure and returns a run
// id, so this function only ever does one of two quick things per call:
// start a run, or check on one. Neither comes close to the ceiling.
//
// It also means the research doesn't depend on anyone keeping the page open.
// Exa keeps going; the next call ingests whatever finished meanwhile.
//
// Claude still does the final pass, because Exa doesn't know Jadara: turning
// grounded findings into the Arabic profile and mapping the entity's needs
// onto Jadara's service lines is our domain knowledge, not search output.
//
// EXA_API_KEY and ANTHROPIC_API_KEY are read only here, from Supabase secrets.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const EXA_BASE = "https://api.exa.ai";
// Dropped from "high" once cost became the concern. Exa bills per run and per
// enriched item, so this and the maxItems bounds below are the two levers that
// actually move the bill. Raise to "high" for a hard-to-find entity.
const EXA_EFFORT = "medium";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ---------------- schemas ---------------- */

const str = { type: "string" };
const strArray = { type: "array", items: { type: "string" } };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arrayOf = (items: unknown, maxItems?: number) =>
  maxItems ? { type: "array", maxItems, items } : { type: "array", items };

/* What Exa is asked to establish. Arrays are bounded: an unbounded list makes
   both run cost and output size unpredictable. */
const EXA_SCHEMA = {
  type: "object",
  properties: {
    legal_name: str,
    name_en: str,
    entity_type: str,
    parent_entity: str,
    established: str,
    headquarters: str,
    website: { type: "string", format: "uri" },
    mandate: str,
    sectors: { type: "array", maxItems: 10, items: str },
    vision_2030_alignment: str,
    published_strategy: str,
    programs: { type: "array", maxItems: 8, items: str },
    stated_challenges: { type: "array", maxItems: 10, items: str },
    leadership: {
      type: "array", maxItems: 10,
      items: { type: "object", properties: { name: str, title: str }, required: ["name", "title"] },
    },
    budget: str,
    staff_size: str,
    departments: { type: "array", maxItems: 10, items: str },
    subsidiaries: { type: "array", maxItems: 10, items: str },
    procurement_platform: str,
    past_tenders: {
      type: "array", maxItems: 8,
      items: {
        type: "object",
        properties: { title: str, reference: str, date: str, supplier: str },
        required: ["title"],
      },
    },
    known_suppliers: { type: "array", maxItems: 8, items: str },
    certifications: { type: "array", maxItems: 8, items: str },
    excellence_awards: { type: "array", maxItems: 8, items: str },
    digital_initiatives: { type: "array", maxItems: 10, items: str },
    recent_developments: {
      type: "array", maxItems: 8,
      items: { type: "object", properties: { date: str, headline: str }, required: ["headline"] },
    },
    not_found: { type: "array", maxItems: 10, items: str },
  },
  required: ["legal_name", "mandate", "not_found"],
};

/* What Claude adds on top of Exa's facts — and nothing else.

   An earlier version had Claude re-emit every field Exa had already returned.
   That paid twice for the same information and compiled into a grammar large
   enough for the API to reject ("The compiled grammar is too large"). Exa's
   structured output is kept verbatim as the factual record; Claude only
   contributes what search can't: the read for Jadara, and the service mapping.
   Small schema, small output, one cheap call. */
const ANALYSIS_SCHEMA = obj({
  summary: str,
  strategic_read: arrayOf(str, 6),
  consulting_entry_points: arrayOf(obj({ need: str, jadara_service: str, rationale: str }), 6),
  unverified: arrayOf(str, 10),
});

const ANALYSIS_SYSTEM = `أنت مستشار أول في شركة "جَدارة الأداء" للاستشارات الإدارية (السعودية). وصلتك حقائق مستخرجة من بحث عن جهة يُحتمل أن تكون عميلاً.

الحقائق نفسها محفوظة ومعروضة كما هي — لا تُعدها ولا تُعد كتابتها. مهمتك ما لا يستطيع البحث إنتاجه فقط:
- summary: فقرة عربية موجزة (٣-٥ جمل) تصف الجهة وما يهمّنا فيها.
- strategic_read: نقاط قصيرة عمّا تعنيه هذه الحقائق لجَدارة تحديداً (حجم الفرصة، نضج الجهة، أسلوب تعاقدها، ما يرجّح أو يضعف موقعنا).
- consulting_entry_points: اربط احتياجاً ظاهراً في الحقائق بخدمة محددة من خدمات جَدارة، مع مبرر مستند إلى ما ورد فعلاً.
- unverified: ما لم يثبت — ابدأ بما ورد في "not_found" وأضف أي فجوة جوهرية تلاحظها.

خدمات جَدارة: الحوكمة وإدارة المخاطر والامتثال (GRC)، إدارة الجودة وتدقيق الآيزو، التميز المؤسسي وتقييم النضج (KAQA / EFQM)، استمرارية الأعمال (BCM/DRP وفق ISO 22301)، تطوير المنهجيات والأطر التنظيمية، بناء القدرات والتدريب.

قواعد صارمة:
- لا تضف معلومة لم ترد في الحقائق. لا تخترع اسماً أو رقماً أو ميزانية أو منافسة.
- إن لم يظهر احتياج واضح، اترك القائمة قصيرة بدل حشوها.
- اكتب بالعربية الفصحى المناسبة لعرض تنفيذي. لا عناوين Markdown.
أرجع JSON حسب المخطط فقط.`;

/* ---------------- helpers ---------------- */

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

async function exa(path: string, init?: RequestInit) {
  const res = await fetch(`${EXA_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("EXA_API_KEY") ?? "",
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Exa ${res.status}: ${body ? JSON.stringify(body).slice(0, 300) : res.statusText}`);
  }
  return body;
}

function buildQuery(row: Record<string, unknown>) {
  const aliases = (row.aliases as string[]) || [];
  return [
    `ابحث بعمق عن الجهة السعودية التالية واجمع كل ما يمكن التحقق منه عنها: "${row.entity_name}".`,
    aliases.length ? `أسماء أو اختصارات أخرى قد تُستخدم: ${aliases.join("، ")}.` : "",
    `ابحث في المصادر العربية والإنجليزية معاً، بما فيها الموقع الرسمي للجهة، التقارير السنوية، المنصات الحكومية السعودية (ومنها منصة اعتماد للمنافسات)، والأخبار.`,
    `ركّز على: الهوية النظامية والجهة الأم، الاختصاص والمهام، الاستراتيجية والارتباط برؤية 2030، القيادة المعلنة، الميزانية وحجم الجهة، الهيكل والإدارات والشركات التابعة، سلوك المشتريات والمنافسات التي طرحتها سابقاً ومن فاز بها، شهادات الجودة ومشاركتها في جوائز التميز، والتطورات الحديثة.`,
    `إن لم تتمكن من إثبات معلومة من مصدر، أدرجها في "not_found" بدل تخمينها. وإن كان هناك التباس بين جهات متشابهة الاسم، اختر السعودية وصرّح بالالتباس.`,
    row.provided_context
      ? `\n\nمواد زوّدنا بها المستخدم عن الجهة (اعتبرها مصدراً موثوقاً وابنِ عليها):\n${row.provided_context}`
      : "",
  ].filter(Boolean).join("\n");
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let profileId: number | null = null;
  const now = () => new Date().toISOString();

  const fail = async (message: string, status = 500) => {
    if (profileId) {
      await admin.from("entity_profiles").update({
        status: "failed", error: message, completed_at: now(),
      }).eq("id", profileId);
    }
    return json({ error: message }, status);
  };

  try {
    const body = await req.json();
    profileId = body?.profileId ?? null;
    if (!profileId) return json({ error: "profileId مطلوب" }, 400);

    // Caught here rather than deep in a client library, where a missing secret
    // surfaces as an opaque auth error that doesn't name the project.
    if (!Deno.env.get("EXA_API_KEY")) {
      return await fail("مفتاح EXA_API_KEY غير مضبوط في أسرار هذا المشروع في Supabase.", 503);
    }
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return await fail("مفتاح ANTHROPIC_API_KEY غير مضبوط في أسرار هذا المشروع في Supabase.", 503);
    }

    const { data: row, error } = await admin
      .from("entity_profiles").select("*").eq("id", profileId).single();
    if (error || !row) return json({ error: "لم يتم العثور على الطلب" }, 404);
    if (row.status === "done") return json({ status: "done", id: row.id });

    /* ---- start a run ---- */
    if (!row.exa_run_id) {
      const run = await exa("/agent/runs", {
        method: "POST",
        body: JSON.stringify({
          query: buildQuery(row),
          effort: EXA_EFFORT,
          outputSchema: EXA_SCHEMA,
        }),
      });

      await admin.from("entity_profiles").update({
        status: "researching",
        started_at: row.started_at || now(),
        error: null,
        exa_run_id: run.id,
        exa_status: run.status,
        stage: "research",
        progress_note: "البحث جارٍ",
        progress_at: now(),
      }).eq("id", profileId);

      return json({ status: "researching", exaRunId: run.id, id: profileId });
    }

    /* ---- check an existing run ---- */
    const run = await exa(`/agent/runs/${row.exa_run_id}`);

    await admin.from("entity_profiles")
      .update({ exa_status: run.status, progress_at: now() }).eq("id", profileId);

    // Status is checked before output is touched: reading output on a failed
    // run makes a failure look like an empty success.
    if (run.status === "failed" || run.status === "cancelled") {
      return await fail(`انتهى البحث بحالة "${run.status}"${run.error ? `: ${run.error}` : ""}`, 502);
    }
    if (run.status !== "completed") {
      return json({ status: "researching", exaStatus: run.status, id: profileId });
    }

    /* ---- completed: shape it into the Arabic profile ---- */
    await admin.from("entity_profiles").update({
      stage: "structuring", progress_note: "ترتيب النتائج في ملف منظّم", progress_at: now(),
    }).eq("id", profileId);

    const facts = run.output?.structured ?? null;

    // Small schema, small ceiling, low effort: this is a shaping task over
    // facts already established, not reasoning that needs headroom.
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
      system: ANALYSIS_SYSTEM,
      messages: [{
        role: "user",
        content: `الجهة: ${row.entity_name}\n\nالحقائق المستخرجة:\n${JSON.stringify(facts)}` +
          (run.output?.text ? `\n\nملخص البحث:\n${run.output.text}` : ""),
      }],
      // deno-lint-ignore no-explicit-any
    } as any);
    const shaped = await stream.finalMessage();

    if (shaped.stop_reason === "refusal") {
      return await fail("تم رفض الطلب من قبل نظام السلامة الخاص بالنموذج", 422);
    }
    const raw = textOf(shaped.content);
    if (!raw) return await fail("لم يُرجع النموذج محتوى", 502);

    // Facts stay exactly as Exa returned them — including in their original
    // language. Translating a tender title would lose the string you'd search
    // Etimad for.
    const profile = { facts, analysis: JSON.parse(raw), search_summary: run.output?.text ?? null };

    await admin.from("entity_profiles").update({
      status: "done",
      stage: "complete",
      profile,
      grounding: run.output?.grounding ?? null,
      exa_cost: run.costDollars?.total ?? null,
      progress_note: null,
      progress_at: now(),
      generated_by_model: shaped.model,
      completed_at: now(),
    }).eq("id", profileId);

    return json({ status: "done", id: profileId });
  } catch (err) {
    console.error("profile-entity error", err);
    return await fail(String(err));
  }
});
