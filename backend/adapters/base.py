from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

from models import Step


@dataclass
class AdapterOutcome:
    end_reason: str  # agent_done | agent_gave_up | max_steps | timeout
    answer: Optional[str] = None


@dataclass
class BrowserSession:
    """What every adapter gets: a live Playwright page, the run's budget, step recording and a per-user key resolver."""
    page: object
    goal: str
    max_steps: int
    remaining: Callable[[], float]
    screenshot: Callable[[str], Awaitable[tuple[str, bytes]]]
    record: Callable[[Step], Awaitable[None]]
    resolve_key: Callable[[str], Awaitable[dict]]
    profile: dict = field(default_factory=dict)
    user_id: str = ""
    public_url: str = ""
    pull_hints: Optional[Callable[[], Awaitable[list]]] = None
    run_id: str = ""


class AgentAdapter(ABC):
    id: str
    name: str
    vendor: str
    description: str
    tier: str = "custom"  # custom | champion | external
    look: dict = {}
    platform_key_ok: bool = True

    def status(self) -> dict:
        return {"available": True, "message": "Ready"}

    def required_provider(self, profile: dict) -> Optional[str]:
        return None

    def info(self) -> dict:
        return {"id": self.id, "name": self.name, "vendor": self.vendor, "description": self.description, "tier": self.tier, "look": self.look, **self.status()}

    @abstractmethod
    async def run(self, session: BrowserSession) -> AdapterOutcome:
        ...
