from adapters.base import AdapterOutcome, AgentAdapter, BrowserSession
from adapters.computer_use import ClaudeComputerUse, GeminiComputerUse, OpenAIComputerUse, OwnEndpoint
from adapters.crab import CrabAdapter

ADAPTERS: dict[str, AgentAdapter] = {a.id: a for a in (CrabAdapter(), ClaudeComputerUse(), OpenAIComputerUse(), GeminiComputerUse(), OwnEndpoint())}

__all__ = ["ADAPTERS", "AdapterOutcome", "AgentAdapter", "BrowserSession"]
