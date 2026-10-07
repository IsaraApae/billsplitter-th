import "server-only";
import { summariseFailure, type ScanAttempt } from "../scanResult";
import { getModelCooldowns, setModelCooldown } from "./redis";

// Gemini over REST (no SDK): one image + a prompt in, JSON text out, with a
// chain of models, retries and a shared cool-down for models that are out of
// quota or overloaded. Used by receipt scanning and slip checking.

/**
 * Models tried in order. Each has its own free-tier quota, so when one is out
 * of quota or overloaded the next one can still answer.
 * Override with GEMINI_MODELS="model-a,model-b,…".
 */
const DEFAULT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
const MODELS = (process.env.GEMINI_MODELS ?? "")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => /^[\w.-]+$/.test(m));
const CHAIN = MODELS.length ? [...new Set(MODELS)] : DEFAULT_MODELS;

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

export interface ImageJsonRequest {
  /** log event name, e.g. "scan" */
  evt: string;
  prompt: string;
  /** JSON Schema (responseJsonSchema) and the older OpenAPI-style fallback */
  schema: object;
  legacySchema: object;
  mime: string;
  /** base64 image */
  data: string;
  /** ~20 s per call and ~55 s overall by default */
  attemptMs?: number;
  totalMs?: number;
}

export type ImageJsonResult =
  | { ok: true; text: string; model: string; attempts: ScanAttempt[] }
  | { ok: false; reason: "not_configured" | ReturnType<typeof summariseFailure>; attempts: ScanAttempt[] };

const log = (evt: string, entry: Record<string, unknown>) => console.info(JSON.stringify({ evt, ...entry }));

/** Lowest thinking level each model accepts (Flash-Lite allows "minimal"). */
function lowestThinking(model: string): "minimal" | "low" {
  return /flash-lite/.test(model) ? "minimal" : "low";
}

/** Google's error status and, for quota errors, which quota was hit. */
function describeGoogleError(raw: string): Record<string, unknown> {
  try {
    const e = (
      JSON.parse(raw) as {
        error?: { status?: string; message?: string; details?: { violations?: { quotaId?: string; quotaMetric?: string }[]; retryDelay?: string }[] };
      }
    ).error;
    const details = e?.details ?? [];
    return {
      googleStatus: e?.status,
      message: e?.message?.split("\n")[0]?.slice(0, 160),
      quota: details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? v.quotaMetric).filter(Boolean),
      retryDelay: details.find((d) => d.retryDelay)?.retryDelay,
    };
  } catch {
    return { detail: raw.slice(0, 300) };
  }
}

function body(req: ImageJsonRequest, model: string, legacy: boolean) {
  const image = legacy
    ? { inline_data: { mime_type: req.mime, data: req.data } }
    : { inline_data: { mime_type: req.mime, data: req.data }, media_resolution: { level: "MEDIA_RESOLUTION_HIGH" } };
  return JSON.stringify({
    contents: [{ role: "user", parts: [image, { text: req.prompt }] }],
    generationConfig: legacy
      ? { temperature: 0, responseMimeType: "application/json", responseSchema: req.legacySchema }
      : {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: req.schema,
          thinkingConfig: { thinkingLevel: lowestThinking(model) },
        },
  });
}

type CallResult = { attempt: ScanAttempt; text?: string; cooldownSec?: number };

/** "32656s" → 32656 */
const seconds = (delay: unknown) => (typeof delay === "string" && /^\d+(\.\d+)?s$/.test(delay) ? parseFloat(delay) : undefined);

/** One Gemini call. A 400 means our request shape was rejected: retried once in the legacy shape. */
async function callModel(req: ImageJsonRequest, model: string, key: string, timeoutMs: number): Promise<CallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const started = Date.now();
  const done = (status: number, outcome: ScanAttempt["outcome"], text?: string): CallResult => ({
    attempt: { model, status, outcome, ms: Date.now() - started },
    text,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const call = (legacy: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: body(req, model, legacy),
      signal: controller.signal,
    });
  try {
    let res = await call(false);
    if (res.status === 400) {
      log(req.evt, { model, status: 400, note: "retrying in legacy request shape", ...describeGoogleError(await res.text().catch(() => "")) });
      res = await call(true);
    }
    if (!res.ok) {
      const g = describeGoogleError(await res.text().catch(() => ""));
      log(req.evt, { model, status: res.status, ...g });
      if (res.status === 429) {
        // Out of quota: skip this model until Google says it resets (daily) or for a minute.
        const daily = Array.isArray(g.quota) && g.quota.some((q) => /PerDay/i.test(String(q)));
        return { ...done(429, "quota"), cooldownSec: seconds(g.retryDelay) ?? (daily ? 3600 : 60) };
      }
      if (res.status === 500 || res.status === 503 || res.status === 504) return done(res.status, "busy");
      // Unknown or retired model name: skip it for a day and try the next one.
      if (res.status === 404) return { ...done(404, "network"), cooldownSec: 86_400 };
      return done(res.status, "api_error"); // 400 etc.: bad image or blocked — another model won't help
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const blocked = json.promptFeedback?.blockReason ?? (json.candidates?.[0]?.finishReason === "SAFETY" ? "SAFETY" : undefined);
    if (blocked) {
      log(req.evt, { model, status: 200, blocked });
      return done(200, "api_error");
    }
    const text =
      json.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "";
    return done(200, "ok", text);
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    log(req.evt, { model, error: aborted ? "timeout" : String(e) });
    return aborted ? { ...done(0, "timeout"), cooldownSec: 120 } : done(0, "network");
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the model chain to read one image. Busy (500/503) gets one retry on
 * the same model after 1–2 s; quota (429) or a timeout moves straight to the
 * next model; a 400 stops the chain. Models that recently ran out of quota,
 * timed out or kept returning 503 go last.
 */
export async function readImageJson(req: ImageJsonRequest): Promise<ImageJsonResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "not_configured", attempts: [] };
  const started = Date.now();
  const total = req.totalMs ?? 55_000;
  const left = () => total - (Date.now() - started);
  const attempts: ScanAttempt[] = [];

  const cooling = await getModelCooldowns(CHAIN);
  const order = [...CHAIN.filter((m) => !cooling.has(m)), ...CHAIN.filter((m) => cooling.has(m))];

  for (const m of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (left() < 5_000) return { ok: false, reason: summariseFailure(attempts), attempts };
      const r = await callModel(req, m, key, Math.min(req.attemptMs ?? 20_000, left()));
      attempts.push(r.attempt);
      const busyTwice = r.attempt.outcome === "busy" && attempt === 1;
      if (r.cooldownSec || busyTwice) await setModelCooldown(m, r.cooldownSec ?? 120);
      if (r.attempt.outcome === "ok" && r.text !== undefined) return { ok: true, text: r.text, model: m, attempts };
      if (r.attempt.outcome === "api_error") return { ok: false, reason: summariseFailure(attempts), attempts };
      if (r.attempt.outcome !== "busy" || attempt === 1) break;
      await sleep(1000 + Math.random() * 1000);
    }
  }
  return { ok: false, reason: summariseFailure(attempts), attempts };
}
