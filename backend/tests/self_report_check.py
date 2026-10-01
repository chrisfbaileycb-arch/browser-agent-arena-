import json, re, requests
B = "http://localhost:8001/api"
s = requests.Session()
r = s.post(f"{B}/auth/login", json={"email": "free@steps.dev", "password": "FreeCrab!2026"}); assert r.ok, r.text
s.headers["Authorization"] = "Bearer " + r.json()["token"]
a = s.post(f"{B}/course-attempts", json={"course_id": "obstacle-1", "agent_kind": "comet"}).json()
print("create", a["agent_label"], a["agent_kind"], a["expires_at"], a["expired"])
aid = a["id"]
print("early submit", s.post(f"{B}/course-attempts/{aid}/submit", json={"code": "SOE-AAAA-BBBB"}).status_code)
print("mine", len(s.get(f"{B}/course-attempts/mine").json()))
order = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"]
code = None
for st in order:
    html = requests.get(f"{B}/courses/obstacle-1/{st}?a={aid}").text
    cfg = json.loads(re.search(r'"nonce":\s*"([^"]+)"', html) and "{" + re.search(r'("nonce":\s*"[^"]+")', html).group(1) + "}")
    res = requests.post(f"{B}/course-attempts/{aid}/clear", json={"station": st, "nonce": cfg["nonce"]}).json()
    code = res.get("code") or code
print("code", code)
r = s.post(f"{B}/course-attempts/{aid}/submit", json={"code": "SOE-ZZZZ-ZZZZ", "reported_elapsed_s": 1})
print("bad", r.status_code, r.json())
r = s.post(f"{B}/course-attempts/{aid}/submit", json={"code": f"my code is {code}", "reported_elapsed_s": 3.2, "recording_url": "https://example.com/v"})
print("good", r.status_code, r.json())
r = s.post(f"{B}/course-attempts/{aid}/submit", json={"code": code})
print("reuse", r.status_code, r.json())
other = requests.Session(); other.headers["Authorization"] = "Bearer " + other.post(f"{B}/auth/login", json={"email": "pro@steps.dev", "password": "ProCrab!2026"}).json()["token"]
print("other user", other.post(f"{B}/course-attempts/{aid}/submit", json={"code": code}).status_code)
b = s.post(f"{B}/course-attempts", json={"course_id": "obstacle-1", "agent_kind": "other", "agent_label": "MyBot"}).json()
print("other label", b["agent_label"])
print("cross-attempt reuse", s.post(f"{B}/course-attempts/{b['id']}/submit", json={"code": code}).status_code)
lb = requests.get(f"{B}/leaderboard/obstacle-1?source=self_reported").json()
print("lb self", len(lb), all(x["badge"] == "self_reported" for x in lb), lb[0]["agent_kind"] if lb else None, lb[0].get("reported_elapsed_s") if lb else None)
lb2 = requests.get(f"{B}/leaderboard/obstacle-1?source=verified").json()
print("lb verified", len(lb2), all(x["badge"] == "verified" for x in lb2))
print("bad kind", s.post(f"{B}/course-attempts", json={"course_id": "obstacle-1", "agent_kind": "hacker"}).status_code)
