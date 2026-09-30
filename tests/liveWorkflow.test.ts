import { describe, expect, it } from "vitest";
import { synthesize } from "../src/core/synthesizer";
import { runLiveWorkflow, type LiveConfig } from "../server/liveWorkflow";

const source = "https://vendor.example/pricing";
const extracted = { payload: { sku: "NX-428", currency: "USD", price: 428 }, citations: [source], evidence: `${source} lists SKU NX-428 at USD 428.` };

function provider(status = 202, choice = "proceed") {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.endsWith("/search")) return Response.json({ results: [{ url: source, title: "Widget NX price", content: "SKU NX-428, currency USD, price 428" }] });
    if (url.includes("generateContent")) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(extracted) }] } }] });
    if (url.endsWith("/systemone")) return Response.json({ answers: { route: { choice }, quality: { score: 4 }, supported: { noul: 1 } } });
    if (url.endsWith("/receive")) return new Response("created", { status });
    throw new Error(`Unexpected URL ${url}`);
  };
  const config: LiveConfig = { tavilyKey: "tavily-test", geminiKey: "gemini-test", jevKey: "jev-test", webhookUrl: "https://hooks.example/receive", fetcher };
  return { calls, config };
}

describe("live workflow", () => {
  it("uses provider responses through all four stages and reports the actual REST status", async () => {
    const { calls, config } = provider(207);
    const dag = synthesize("Track Widget NX street price and POST to ERP");
    dag.nodes[1].prompt = "Only extract directly supported price fields";
    const result = await runLiveWorkflow(dag, config, true);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("live");
    expect(result.payload).toEqual(extracted.payload);
    expect(result.dispatch).toMatchObject({ attempted: true, status: 207, ok: true });
    expect(calls.map(call => call.url)).toEqual([
      "https://api.tavily.com/search",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "https://api.typesafe.ai/v1/systemone",
      "https://hooks.example/receive",
    ]);
    expect(JSON.stringify(calls[1].body)).toContain("Only extract directly supported price fields");
    expect(calls[3].body.payload).toEqual(extracted.payload);
  });

  it("holds dispatch when Jev rejects the result", async () => {
    const { calls, config } = provider(202, "review");
    const result = await runLiveWorkflow(synthesize("Track Widget NX street price"), config, true);
    expect(result.ok).toBe(false);
    expect(result.dispatch.attempted).toBe(false);
    expect(calls).toHaveLength(3);
  });

  it("requires all provider keys before making any network call", async () => {
    const { calls, config } = provider();
    await expect(runLiveWorkflow(synthesize("Track Widget NX street price"), { ...config, geminiKey: "" })).rejects.toThrow("GEMINI_API_KEY");
    expect(calls).toHaveLength(0);
  });

  it("runs successfully with Gemini alone without Tavily or Jev keys", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("generateContent")) {
        const prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
        if (prompt.includes("Gatekeeper")) {
          return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ route: "proceed", score: 0.95, noul: 1.0 }) }] } }] });
        }
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ payload: { sku: "NX-428", currency: "USD", price: 428 }, citations: ["https://vendor-a.example/pricing"], evidence: "Pricing confirmed" }) }] } }] });
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    const result = await runLiveWorkflow(synthesize("Track Widget NX street price"), { geminiKey: "gemini-only-test", fetcher }, false);
    expect(result.ok).toBe(true);
    expect(result.payload.price).toBe(428);
    expect(calls.every(c => c.includes("generateContent"))).toBe(true);
  });

  it("reports a failed destination response instead of claiming delivery", async () => {
    const { config } = provider(503);
    const result = await runLiveWorkflow(synthesize("Track Widget NX street price"), config, true);
    expect(result.ok).toBe(false);
    expect(result.dispatch).toMatchObject({ attempted: true, status: 503, ok: false });
  });
});
