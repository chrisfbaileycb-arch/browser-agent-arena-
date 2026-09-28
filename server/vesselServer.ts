import { createServer } from "node:http";
import { synthesize, runVessel } from "../src/core/synthesizer";
const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
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
