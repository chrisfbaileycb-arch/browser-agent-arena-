import time
from datetime import datetime, timezone

from bson import ObjectId

from adapters.base import AdapterOutcome, AgentAdapter, BrowserSession
from adapters.crab import CrabAdapter, station_of
from db import db

ROLE_NAMES = {"scout": "Scout", "extract": "Extractor", "gate": "Gatekeeper", "settle": "Settlement"}
DEFAULT_ASSIGNMENTS = {"start": "scout", "wall": "scout", "doors": "gate", "rope": "extract", "beam": "gate", "tunnel": "scout", "finish": "settle",
                       "entry": "scout", "current": "scout", "maze": "gate", "crates": "extract", "tide": "gate", "cave": "extract", "lookalike": "gate"}
CRAB = CrabAdapter()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RelayAdapter(AgentAdapter):
    """Four squad crabs share ONE browser session; the baton passes whenever the page reaches a station owned by another role."""
    id, name, vendor, tier = "relay", "Squad Relay", "Steps of Execution", "custom"
    description = "Your Scout, Extractor, Gatekeeper and Settlement crabs run the course as a relay in one real browser session."

    def required_provider(self, profile: dict):
        return None

    async def run(self, session: BrowserSession) -> AdapterOutcome:
        legs, assign = {leg["role"]: leg for leg in session.profile["legs"]}, session.profile["assignments"]
        oid, n, index = ObjectId(session.run_id), 0, 0
        first_station = session.profile.get("first_station", "start")
        role_at = lambda station: assign.get(station or first_station, "scout")  # noqa: E731
        while True:
            station = station_of(session.page.url) or first_station
            role = role_at(station)
            leg = legs[role]
            first, t0 = n + 1, time.monotonic()
            summary = {"index": index, "role": role, "role_name": ROLE_NAMES[role], "crab_id": leg.get("crab_id"), "name": leg["name"],
                       "color": leg.get("color"), "accent": leg.get("accent"), "accessory": leg.get("accessory"), "from_station": station,
                       "started_at": now_iso(), "status": "running"}
            await db.runs.update_one({"_id": oid}, {"$push": {"legs": summary}})
            baton = [f"RELAY: you are the {ROLE_NAMES[role]} leg of a squad relay. Teammates brought this browser to station '{station}'. "
                     "Continue from the current page; stop worrying about stations owned by teammates."]
            outcome, n = await CRAB.loop(session, leg, start_n=n + 1, stop=lambda s: role_at(s) != role, meta={"leg": index, "role": role},
                                         history=baton)
            reached = station_of(session.page.url) or station
            status = {"handoff": "passed", "agent_done": "finished"}.get(outcome.end_reason, "failed")
            steps = max(0, n - first + 1)
            patch = {"status": status, "end_reason": outcome.end_reason, "to_station": reached, "steps": steps,
                     "elapsed_s": round(time.monotonic() - t0, 1), "finished_at": now_iso()}
            await db.runs.update_one({"_id": oid}, {"$set": {f"legs.{index}.{k}": v for k, v in patch.items()}})
            if status == "failed":
                reason = {"max_steps": "ran out of steps", "timeout": "ran out of time", "agent_gave_up": "gave up"}.get(outcome.end_reason, outcome.end_reason)
                await db.runs.update_one({"_id": oid}, {"$set": {"relay_failure": f"Leg {index + 1} ({ROLE_NAMES[role]} · {leg['name']}) {reason} at station '{reached}'. Relay stopped."}})
            if status != "passed":
                return outcome
            index += 1
