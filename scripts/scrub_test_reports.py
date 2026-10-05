"""Redacts credentials from test reports and test files. Run after every testing pass: python3 scripts/scrub_test_reports.py"""
import re
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parent.parent
env = dotenv_values(ROOT / "backend" / ".env")
secrets = {v.strip() for k, v in env.items() if v and re.search(r"PASSWORD|SECRET|_KEY|TOKEN", k) and len(v.strip()) >= 8}
secrets |= {c.strip() for c in (env.get("ACCESS_CODES") or "").split(",") if c.strip()}
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
secrets |= {d["code"] for d in db.access_codes.find({}, {"code": 1})}
targets = [p for p in (ROOT / "test_reports").rglob("*") if p.is_file()] + [p for p in (ROOT / "backend" / "tests").rglob("*.py")]
for path in targets:
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue
    new = text
    for s in sorted(secrets, key=len, reverse=True):
        new = new.replace(s, "<redacted>")
    if new != text:
        path.write_text(new)
        print("scrubbed", path.relative_to(ROOT))
