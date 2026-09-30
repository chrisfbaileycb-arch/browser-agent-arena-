import { describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { ECOM_CHALLENGE } from "../src/data/arenaChallenges";
import { runBrowserDuel } from "../server/browserDuel";

function browser() {
  const page = {
    goto: async () => {}, url: () => "https://shop.example/widget-nx", setDefaultTimeout: () => {},
    screenshot: async () => Buffer.from("captured screenshot"),
    locator: (selector: string) => ({
      first: () => ({ count: async () => 1, isVisible: async () => true, innerText: async () => selector === "body" ? "SKU NX-428 at USD 428" : "Widget NX price" }),
      innerText: async () => "SKU NX-428 at USD 428",
    }),
  };
  const close = async () => {};
  return { newContext: async () => ({ newPage: async () => page, close }), close } as unknown as Browser;
}

describe("live browser duel", () => {
  it("opens separate pages, extracts from observed text, and uses the real gate response", async () => {
    let pages = 0;
    const fakeBrowser = browser();
    const launchBrowser = async () => ({ ...fakeBrowser, newContext: async () => { pages++; return fakeBrowser.newContext(); } }) as Browser;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/systemone")) return Response.json({ answers: { route: { choice: "proceed" }, quality: { score: 4 }, supported: { noul: 1 } } });
      const prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
      const output = prompt.includes("Extract a JSON object")
        ? { payload: { sku: "NX-428", currency: "USD", price: 428 }, evidence: "Observed SKU NX-428 at USD 428" }
        : { action: "done", reason: "The visible price is enough" };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }], usageMetadata: { promptTokenCount: 37 } });
    };
    const challenge = { ...ECOM_CHALLENGE, url: "https://shop.example/widget-nx", cleanPayload: { sku: "fabricated", currency: "USD", price: 999 }, assertions: [{ field: "price", operator: "equals" as const, value: "428" }] };
    const result = await runBrowserDuel(challenge, { geminiKey: "test", jevKey: "test", fetcher, launchBrowser });
    expect(pages).toBe(2);
    expect(result.lanes.every(lane => lane.success)).toBe(true);
    expect(result.lanes[0].payload?.price).toBe(428);
    expect(result.lanes[0].screenshot).toBe(Buffer.from("captured screenshot").toString("base64"));
    expect(result.lanes[0].events[0].action).toBe("navigate");
  });

  it("requires provider keys before opening a browser", async () => {
    await expect(runBrowserDuel({ ...ECOM_CHALLENGE, url: "https://shop.example" }, { geminiKey: "", jevKey: "" })).rejects.toThrow("GEMINI_API_KEY");
  });

  it("supports OpenAI key for Lane A in Arena competition duel", async () => {
    const fakeBrowser = browser();
    const launchBrowser = async () => ({ ...fakeBrowser, newContext: async () => fakeBrowser.newContext() }) as Browser;
    const urlsCalled: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      urlsCalled.push(url);
      if (url.includes("api.openai.com")) {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const userMsg = body.messages[1]?.content || "";
        const output = userMsg.includes("Extract a JSON object")
          ? { payload: { sku: "NX-428", currency: "USD", price: 428 }, evidence: "Observed SKU NX-428 at USD 428" }
          : { action: "done", reason: "The visible price is enough" };
        return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 42 } });
      }
      if (url.includes("generateContent")) {
        const prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
        const output = prompt.includes("Extract a JSON object")
          ? { payload: { sku: "NX-428", currency: "USD", price: 428 }, evidence: "Observed SKU NX-428 at USD 428" }
          : prompt.includes("Gatekeeper")
          ? { choice: "proceed", score: 0.9, noul: 0.95 }
          : { action: "done", reason: "The visible price is enough" };
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }], usageMetadata: { promptTokenCount: 37 } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const challenge = { ...ECOM_CHALLENGE, url: "https://shop.example/widget-nx", cleanPayload: { sku: "fabricated", currency: "USD", price: 999 }, assertions: [{ field: "price", operator: "equals" as const, value: "428" }] };
    const result = await runBrowserDuel(challenge, { geminiKey: "gemini-key", openaiKey: "openai-key", fetcher, launchBrowser });
    expect(result.lanes.every(lane => lane.success)).toBe(true);
    expect(urlsCalled.some(u => u.includes("api.openai.com"))).toBe(true);
    expect(urlsCalled.some(u => u.includes("generateContent"))).toBe(true);
  });
});
