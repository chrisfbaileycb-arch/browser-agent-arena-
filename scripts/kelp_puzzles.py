#!/usr/bin/env python3
"""Emit real kelp-2 puzzle fixtures (from backend/kelp.py) as JSON for the course smoke tests."""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from kelp import puzzle  # noqa: E402

SEEDS = ["smoke-seed-1", "smoke-seed-2"]
STATIONS = ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"]

out = {}
for seed in SEEDS:
    out[seed] = {}
    for station in STATIONS:
        p, answer = puzzle(seed, station)
        out[seed][station] = {"puzzle": p, "answer": answer}
print(json.dumps(out))
