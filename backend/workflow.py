import asyncio
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException

from auth import current_user
from db import db
from jev import jev_ask
from keys import KeyMissing, has_key, resolve_key
from llm import MODELS, ask_json
from models import WorkflowRequest
from quota import consume_execution
from safety import check_url
from security import rate_limit

router = APIRouter(prefix="/api/workflow")
INTENTS = {"price", "news", "compliance", "lead", "vat", "outage", "leak", "rfp"}
GATE_QUESTIONS = lambda prompt: {  # noqa: E731
    "route": {"type": "choice", "instructions": f"{prompt}. Decide whether the payload is supported by the cited source text.",
              "criteria": {"proceed": "All required data is supported", "review": "Some evidence is ambiguous", "abort": "Claims are contradicted or unsupported"}},
    "quality": {"type": "score", "instructions": "Completeness and source support of the structured payload",
                "criteria": ["Unsupported", "Weak", "Partial", "Mostly supported", "Fully supported"]},
    "supported": {"type": "noul", "instructions": "Every non-null payload field is directly supported by the cited source excerpts"},
}


def noul_local(value, schema, path="$", out=None) -> list[str]:
    out = [] if out is None else out
    if not schema:
        return out
    kind = schema.get("type")
    if kind == "object":
        if not isinstance(value, dict):
            out.append(f"{path} expected object")
            return out
        for r in schema.get("required", []):
            if value.get(r) in (None, ""):
                out.append(f"{path}.{r} required")
        for k, sub in (schema.get("properties") or {}).items():
            if k in value and value[k] is not None:
                noul_local(value[k], sub, f"{path}.{k}", out)
    elif kind == "number" and (not isinstance(value, (int, float)) or isinstance(value, bool)):
        out.append(f"{path} expected number")
    elif kind == "string" and not isinstance(value, str):
        out.append(f"{path} expected string")
    elif kind == "boolean" and not isinstance(value, bool):
        out.append(f"{path} expected boolean")
    elif kind == "array" and not isinstance(value, list):
        out.append(f"{path} expected array")
    return out


async def llm_for(user: dict) -> dict:
    for provider in ("gemini", "openai", "anthropic"):
        try:
            return {"provider": provider, "model": MODELS[provider][0], "api_key": (await resolve_key(user, provider))["key"]}
        except KeyMissing:
            continue
    raise KeyMissing("Add your Google Gemini, OpenAI or Anthropic key in My Keys to run this.")


async def tavily(user: dict, query: str, url: str | None) -> list[dict]:
    key = (await resolve_key(user, "tavily"))["key"]
    body = {"query": query, "search_depth": "basic", "max_results": 6, "include_raw_content": True}
    if url:
        body["include_domains"] = [httpx.URL(url).host]
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post("https://api.tavily.com/search", headers={"Authorization": f"Bearer {key}"}, json=body)
    if r.status_code != 200:
        raise HTTPException(502, f"Tavily returned HTTP {r.status_code}: {r.text[:200]}")
    docs = [{"url": d.get("url", ""), "title": d.get("title", ""), "text": (d.get("raw_content") or d.get("content") or "")[:4500]}
            for d in r.json().get("results", []) if str(d.get("url", "")).startswith("http")]
    docs = [d for d in docs if d["text"].strip()]
    if not docs:
        raise HTTPException(422, "Tavily returned no source content for this objective.")
    return docs


def validate_dag(body: WorkflowRequest) -> list[dict]:
    dag = body.workflow
    nodes = dag.get("nodes") if isinstance(dag, dict) else None
    if dag.get("intent") not in INTENTS or not isinstance(nodes, list) or [n.get("id") for n in nodes] != ["scout", "extract", "gate", "settle"]:
        raise HTTPException(400, "Live execution requires Scout, Extractor, Gatekeeper, and Settlement in order.")
    return nodes


async def run_squad(user: dict, body: WorkflowRequest, docs: list[dict]) -> dict:
    nodes, trace, t0 = validate_dag(body), [], time.monotonic()
    budget = max(200, int(nodes[0].get("pruneBudget", 720))) * 4
    excerpts = []
    for d in docs:
        text = d["text"][:max(0, min(budget, 4500))]
        budget -= len(text)
        if text:
            excerpts.append({**d, "text": text})
    sources = [d["url"] for d in excerpts]
    trace.append({"stage": "Scout", "detail": f"{len(docs)} live Tavily results; {len(excerpts)} excerpts kept within the prune budget."})
    schema = (nodes[1].get("jev") or {}).get("noul") or {"type": "object"}
    llm = await llm_for(user)
    parsed = await ask_json("You are the Extractor specialist. Return only JSON.",
                            f"Objective: {body.objective}\nExtractor instructions: {nodes[1].get('prompt', '')}\nReturn a JSON object with payload, citations, and evidence. "
                            f"payload must satisfy {schema}. citations must be source URLs from the excerpts. Use null for unavailable fields; never invent values.\n"
                            "Sources:\n" + "\n\n".join(f"URL: {d['url']}\nTitle: {d['title']}\nText: {d['text']}" for d in excerpts), **llm)
    payload = parsed.get("payload") if isinstance(parsed.get("payload"), dict) else {}
    citations = [u for u in parsed.get("citations", []) if isinstance(u, str) and u in sources] if isinstance(parsed.get("citations"), list) else []
    evidence = parsed.get("evidence") if isinstance(parsed.get("evidence"), str) else ""
    violations = noul_local(payload, schema)
    trace.append({"stage": "Extractor", "detail": f"{len(payload)} fields; {len(citations)} cited sources; {len(violations)} schema violations ({llm['provider']})."})
    state = {"objective": body.objective, "payload": payload, "evidence": evidence, "citations": citations, "sources": excerpts}
    jev = await jev_ask(user, state, GATE_QUESTIONS(nodes[2].get("prompt", "Check the result")))
    if jev["status"] == "ok":
        a = jev["answers"]
        choice, score, noul, gate_by = a["route"]["choice"], float(a["quality"]["score"]) / 4, float(a["supported"]["noul"]), "Jev"
    else:
        gate = await ask_json("You are the Gatekeeper. Return only JSON.", f"Payload: {payload}\nEvidence: {evidence}\nCitations: {citations}\nSources: {excerpts}\n"
                              'Is the payload supported? Return {"route":"proceed|review|abort","score":0-1,"noul":0-1}', **llm)
        choice = gate.get("route") if gate.get("route") in ("proceed", "review", "abort") else "abort"
        score = gate.get("score") if isinstance(gate.get("score"), (int, float)) else 0.0
        noul = gate.get("noul") if isinstance(gate.get("noul"), (int, float)) else 0.0
        gate_by = f"LLM gate (Jev: {jev['message']})"
    floor = float((nodes[2].get("jev") or {}).get("scoreMin", 0.72))
    passed = not violations and bool(citations) and bool(evidence.strip()) and choice == "proceed" and score >= floor and noul >= floor
    trace.append({"stage": "Gatekeeper", "detail": f"{gate_by}: {choice}; score {score:.2f}, support {noul:.2f}; {'passed' if passed else 'held'}."})
    dispatch = {"attempted": False}
    if body.dispatch_url and passed:
        safety = await check_url(body.dispatch_url)
        if not safety["allowed"]:
            dispatch = {"attempted": False, "blocked": safety["reason"]}
        else:
            async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
                r = await client.post(safety["url"], json={"intent": body.workflow["intent"], "objective": body.objective, "payload": payload, "citations": citations})
            dispatch = {"attempted": True, "url": safety["url"], "status": r.status_code, "ok": r.is_success}
    trace.append({"stage": "Settlement", "detail": f"Dispatch HTTP {dispatch['status']}" if dispatch.get("attempted") else "Result ready; no dispatch sent."})
    return {"mode": "squad", "ok": passed, "payload": payload, "citations": citations, "evidence": evidence,
            "gate": {"by": gate_by, "choice": choice, "score": score, "noul": noul, "schemaPass": not violations, "violations": violations, "jev": jev},
            "dispatch": dispatch, "trace": trace, "duration_ms": int((time.monotonic() - t0) * 1000)}


async def run_solo(user: dict, body: WorkflowRequest, docs: list[dict]) -> dict:
    t0, llm = time.monotonic(), await llm_for(user)
    parsed = await ask_json("You are a single all-in-one research agent. Return only JSON.",
                            f"Objective: {body.objective}\nReturn {{\"payload\": {{...}}, \"evidence\": \"...\"}} using these raw search results:\n"
                            + "\n\n".join(f"URL: {d['url']}\nText: {d['text']}" for d in docs), **llm)
    return {"mode": "solo", "ok": isinstance(parsed.get("payload"), dict), "payload": parsed.get("payload"), "evidence": parsed.get("evidence"),
            "gate": None, "trace": [{"stage": "Solo", "detail": f"One {llm['provider']} call over {len(docs)} raw results, no gate."}],
            "duration_ms": int((time.monotonic() - t0) * 1000)}


@router.get("/status")
async def status(user: dict = Depends(current_user)):
    return {p: await has_key(user, p) for p in ("gemini", "openai", "anthropic", "openrouter", "tavily")}


@router.post("/live")
async def live(body: WorkflowRequest, user: dict = Depends(current_user)):
    rate_limit("workflow", str(user["_id"]), 6)
    try:
        await consume_execution(user, "workflow")
        docs = await tavily(user, body.objective, body.target_url)
        squad, solo = await asyncio.gather(run_squad(user, body, docs), run_solo(user, body, docs))
    except KeyMissing as exc:
        raise HTTPException(412, str(exc))
    result = {"objective": body.objective, "intent": body.workflow.get("intent"), "sources": [d["url"] for d in docs], "squad": squad, "solo": solo}
    await db.workflow_runs.insert_one({**result, "user_id": str(user["_id"]), "created_at": time.time()})
    result.pop("_id", None)
    return result
