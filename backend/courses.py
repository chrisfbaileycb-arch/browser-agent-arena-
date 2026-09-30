import html
import json
from pathlib import Path

COURSE_DIR = Path(__file__).parent / "courses"

COURSES = {
    "obstacle-1": {
        "id": "obstacle-1",
        "name": "Obstacle Course 1 — The Tidepool Gauntlet",
        "stations": [
            {"id": "start", "name": "Start Line", "obstacle": "Read the rules; ignore the skip button"},
            {"id": "wall", "name": "The Wall", "obstacle": "Hold is hidden until the wall is scrolled"},
            {"id": "doors", "name": "Decoy Doors", "obstacle": "Only the door matching the plaque is real"},
            {"id": "rope", "name": "Rope Climb", "obstacle": "Three-step form with validation"},
            {"id": "beam", "name": "Balance Beam", "obstacle": "Swaying planks, clicked in order"},
            {"id": "tunnel", "name": "The Tunnel", "obstacle": "Sideways scroll maze with dead ends"},
            {"id": "finish", "name": "Finish Flag", "obstacle": "Server-issued success code"},
        ],
        "default_goal": "Clear every station of the obstacle course in order and report the success code shown at the finish flag.",
    }
}


def station_ids(course_id: str) -> list[str]:
    return [s["id"] for s in COURSES[course_id]["stations"]]


def _page(course_id: str, station: str, title: str, body: str, config: dict) -> str:
    layout = (COURSE_DIR / course_id / "_layout.html").read_text()
    return (layout.replace("{{TITLE}}", html.escape(title))
            .replace("{{STATION}}", html.escape(station))
            .replace("{{CONFIG}}", json.dumps(config).replace("</", "<\\/"))
            .replace("{{BODY}}", body))


def render_station(course_id: str, station: str, attempt) -> str:
    course = COURSES[course_id]
    order = station_ids(course_id)
    index = order.index(station)
    config = {
        "course": course_id, "attempt": attempt.id, "station": station, "index": index, "order": order,
        "names": [s["name"] for s in course["stations"]], "cleared": attempt.cleared, "nonce": attempt.nonces[station],
        "decoys": attempt.decoys, "started_at": attempt.started_at, "code": attempt.code if station == order[-1] else None,
    }
    body = (COURSE_DIR / course_id / f"{station}.html").read_text()
    return _page(course_id, station, course["stations"][index]["name"], body, config)


def render_notice(course_id: str, heading: str, message: str, link: str, link_text: str) -> str:
    body = (f'<section class="board notice"><div class="station-tag">Course marshal</div><h1>{html.escape(heading)}</h1>'
            f'<p>{html.escape(message)}</p><a class="btn go" href="{html.escape(link)}">{html.escape(link_text)}</a></section>')
    order = station_ids(course_id)
    config = {"course": course_id, "attempt": None, "station": "notice", "index": -1, "order": order,
              "names": [s["name"] for s in COURSES[course_id]["stations"]], "cleared": [], "nonce": "", "decoys": 0,
              "started_at": None, "code": None}
    return _page(course_id, "notice", heading, body, config)
