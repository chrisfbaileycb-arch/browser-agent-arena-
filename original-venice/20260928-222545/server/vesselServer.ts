import { createServer } from "node:http";
import { synthesize, runVessel } from "../src/core/synthesizer";
const port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/run") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { objective?: string };
    const dag = synthesize(body.objective || "Track Widget NX street price and POST to ERP");
    const result = await runVessel(dag, () => {});
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "nexusrelay-vessel" }));
}).listen(port);
