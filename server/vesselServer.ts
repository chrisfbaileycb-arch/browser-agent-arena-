import { createServer } from "node:http";
import { synthesize, runVessel } from "../src/core/synthesizer";
import { configFromEnv, runLiveWorkflow } from "./liveWorkflow";
import { runBrowserDuel } from "./browserDuel";
import type { Intent, WorkflowDag } from "../src/types";
import type { ArenaChallenge } from "../src/data/arenaChallenges";
const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/workflow/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      firebase: Boolean(process.env.FIREBASE_API_KEY || process.env.FIREBASE_PROJECT_ID),
      tavily: Boolean(process.env.TAVILY_API_KEY),
      jev: Boolean(process.env.TYPESAFE_API_KEY),
      destinations: (["price", "news", "compliance", "lead", "vat", "outage", "leak", "rfp"] as Intent[]).filter(intent => Boolean(process.env[`WORKFLOW_WEBHOOK_URL_${intent.toUpperCase()}`]))
    }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/workflow/live") {
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const c of req) {
        bytes += c.length;
        if (bytes > 24_000) throw new Error("Request too large");
        chunks.push(c as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { objective?: unknown; workflow?: WorkflowDag; dispatch?: unknown };
      if (typeof body.objective !== "string" || !body.objective.trim() || body.objective.length > 2000) throw new Error("A workflow objective of up to 2000 characters is required.");
      const dag = body.workflow ?? synthesize(body.objective);
      if (dag.objective !== body.objective || !Array.isArray(dag.nodes) || dag.nodes.length !== 4 || !Array.isArray(dag.edges)) throw new Error("Invalid workflow.");
      const result = await runLiveWorkflow(dag, configFromEnv(dag.intent), body.dispatch === true);
      res.writeHead(result.ok ? 200 : 422, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ mode: "live", ok: false, error: error instanceof Error ? error.message : "Live workflow failed" }));
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/arena/live") {
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const c of req) {
        bytes += c.length;
        if (bytes > 32_000) throw new Error("Challenge request too large");
        chunks.push(c as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { challenge?: ArenaChallenge };
      if (!body.challenge || typeof body.challenge.url !== "string" || !Array.isArray(body.challenge.nodes) || !body.challenge.schema) throw new Error("A complete browser challenge is required.");
      const result = await runBrowserDuel(body.challenge, {
        geminiKey: process.env.GEMINI_API_KEY || "",
        openaiKey: process.env.OPENAI_API_KEY || "",
        jevKey: process.env.TYPESAFE_API_KEY || "",
        geminiModel: process.env.GEMINI_MODEL,
        openaiModel: process.env.OPENAI_MODEL,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ mode: "live browser", error: error instanceof Error ? error.message : "Browser duel failed" }));
    }
    return;
  }
  if (req.method === "POST" && req.url === "/run") {
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const c of req) {
        bytes += c.length;
        if (bytes > 16_384) throw new Error("Request too large");
        chunks.push(c as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { objective?: unknown };
      if (body.objective !== undefined && (typeof body.objective !== "string" || body.objective.length > 2000)) throw new Error("Invalid objective");
      const dag = synthesize(body.objective || "Track Widget NX street price and POST to ERP");
      const result = await runVessel(dag, () => {});
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ mode: "fixture simulation", ...result }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid request" }));
    }
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "nexusrelay-demo", mode: "fixture simulation" }));
}).listen(port, "127.0.0.1");
