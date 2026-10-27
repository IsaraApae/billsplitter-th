import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./redis", () => ({ getModelCooldowns: async () => new Set<string>(), setModelCooldown: async () => {} }));

const { readImageJson } = await import("./gemini");

/** Fake Gemini: each model answers `text` (or fails with `status`) after `ms`. */
function fakeGemini(models: Record<string, { ms: number; text?: string; status?: number }>) {
  const started: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const model = /models\/([^:]+):/.exec(url)![1];
    started.push(model);
    const m = models[model] ?? { ms: 10, status: 503 };
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => {
        if (m.status) return resolve(new Response("{}", { status: m.status }));
        resolve(Response.json({ candidates: [{ content: { parts: [{ text: m.text }] } }] }));
      }, m.ms);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
  });
  return started;
}

const req = (accept?: (t: string) => boolean) => ({
  evt: "test",
  prompt: "read it",
  schema: {},
  legacySchema: {},
  mime: "image/jpeg",
  data: "",
  fastFirst: true,
  accept,
});

describe("readImageJson with fastFirst", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts Flash-Lite with the best model and takes its quicker answer", async () => {
    const started = fakeGemini({
      "gemini-3.8-flash": { ms: 200, text: "best" },
      "gemini-3.5-flash-lite": { ms: 20, text: "lite" },
    });
    const r = await readImageJson(req());
    expect(started.slice(0, 2)).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    expect(r).toMatchObject({ ok: true, text: "lite", model: "gemini-3.5-flash-lite" });
  });

  it("waits for the best model when the quick answer fails the check", async () => {
    const started = fakeGemini({
      "gemini-3.8-flash": { ms: 80, text: "good" },
      "gemini-3.5-flash-lite": { ms: 20, text: "bad" },
    });
    const r = await readImageJson(req((t) => t === "good"));
    expect(r).toMatchObject({ ok: true, text: "good", model: "gemini-3.8-flash" });
    expect(started).toHaveLength(2); // no extra model started for the rejected answer
  });

  it("falls back to the rejected answer when nothing better comes", async () => {
    fakeGemini({
      "gemini-3.8-flash": { ms: 80, status: 503 },
      "gemini-3.5-flash-lite": { ms: 20, text: "bad" },
    });
    const r = await readImageJson(req((t) => t === "good"));
    expect(r).toMatchObject({ ok: true, text: "bad", model: "gemini-3.5-flash-lite" });
  });
});
