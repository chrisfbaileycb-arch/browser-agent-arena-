import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesize, runVessel } from "./src/core/synthesizer";
import { configFromEnv, runLiveWorkflow } from "./server/liveWorkflow";
import { runBrowserDuel } from "./server/browserDuel";
import type { Intent, WorkflowDag } from "./src/types";
import type { ArenaChallenge } from "./src/data/arenaChallenges";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/workflow/status", (req, res) => {
    res.json({
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      firebase: Boolean(process.env.FIREBASE_API_KEY || process.env.FIREBASE_PROJECT_ID),
      tavily: Boolean(process.env.TAVILY_API_KEY),
      jev: Boolean(process.env.TYPESAFE_API_KEY),
      destinations: (["price", "news", "compliance", "lead", "vat", "outage", "leak", "rfp"] as Intent[]).filter(intent =>
        Boolean(process.env[`WORKFLOW_WEBHOOK_URL_${intent.toUpperCase()}`])
      ),
    });
  });

  app.post("/api/workflow/live", async (req, res) => {
    try {
      const body = req.body as { objective?: unknown; workflow?: WorkflowDag; dispatch?: unknown };
      if (typeof body.objective !== "string" || !body.objective.trim() || body.objective.length > 2000) {
        return res.status(400).json({ mode: "live", ok: false, error: "A workflow objective of up to 2000 characters is required." });
      }
      const dag = body.workflow ?? synthesize(body.objective);
      if (dag.objective !== body.objective || !Array.isArray(dag.nodes) || dag.nodes.length !== 4 || !Array.isArray(dag.edges)) {
        return res.status(400).json({ mode: "live", ok: false, error: "Invalid workflow." });
      }
      const result = await runLiveWorkflow(dag, configFromEnv(dag.intent), body.dispatch === true);
      res.status(result.ok ? 200 : 422).json(result);
    } catch (error) {
      res.status(400).json({ mode: "live", ok: false, error: error instanceof Error ? error.message : "Live workflow failed" });
    }
  });

  app.post("/api/arena/live", async (req, res) => {
    try {
      const body = req.body as { challenge?: ArenaChallenge };
      if (!body.challenge || typeof body.challenge.url !== "string" || !Array.isArray(body.challenge.nodes) || !body.challenge.schema) {
        return res.status(400).json({ mode: "live browser", error: "A complete browser challenge is required." });
      }
      const result = await runBrowserDuel(body.challenge, {
        geminiKey: process.env.GEMINI_API_KEY || "",
        openaiKey: process.env.OPENAI_API_KEY || "",
        jevKey: process.env.TYPESAFE_API_KEY || "",
        geminiModel: process.env.GEMINI_MODEL,
        openaiModel: process.env.OPENAI_MODEL,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ mode: "live browser", error: error instanceof Error ? error.message : "Browser duel failed" });
    }
  });

  app.post("/run", async (req, res) => {
    try {
      const body = req.body as { objective?: unknown };
      if (body.objective !== undefined && (typeof body.objective !== "string" || body.objective.length > 2000)) {
        return res.status(400).json({ error: "Invalid objective" });
      }
      const dag = synthesize((body.objective as string) || "Track Widget NX street price and POST to ERP");
      const result = await runVessel(dag, () => {});
      res.json({ mode: "fixture simulation", ...result });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: PORT },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NexusRelay server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
