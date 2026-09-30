from typing import Optional


def score_run(success: bool, steps: Optional[int], elapsed: float, decoys: int, stages_cleared: int, total_stages: int,
              max_steps: int, timeout_s: float) -> dict:
    """0-100. Success: 60 base + up to 20 step efficiency + up to 20 time efficiency - 10/decoy.
    Unknown step counts (external agents) put the full 40 on time. Failure: up to 40 for progress - 5/decoy."""
    decoy_penalty = 10 * decoys if success else 5 * decoys
    if success:
        time_share = 20 if steps is not None else 40
        step_eff = round(20 * max(0.0, 1 - steps / max_steps), 1) if steps is not None else None
        time_eff = round(time_share * max(0.0, 1 - elapsed / timeout_s), 1)
        raw = 60 + (step_eff or 0) + time_eff - decoy_penalty
        breakdown = {"completion": 60, "step_efficiency": step_eff, "time_efficiency": time_eff, "decoy_penalty": -decoy_penalty}
    else:
        progress = round(40 * stages_cleared / total_stages, 1) if total_stages else 0
        raw = progress - decoy_penalty
        breakdown = {"completion": 0, "progress": progress, "decoy_penalty": -decoy_penalty}
    return {"total": int(round(max(0, min(100, raw)))), "success": success, "steps": steps,
            "elapsed_s": round(elapsed, 1), "decoys_hit": decoys, "breakdown": breakdown}
