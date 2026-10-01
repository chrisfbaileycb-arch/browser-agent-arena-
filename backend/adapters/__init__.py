from adapters.base import AdapterOutcome, AgentAdapter, BrowserSession
from adapters.computer_use import ClaudeComputerUse, GeminiComputerUse, OpenAIComputerUse, OwnEndpoint
from adapters.crab import CrabAdapter
from adapters.relay import RelayAdapter

ADAPTERS: dict[str, AgentAdapter] = {a.id: a for a in (CrabAdapter(), RelayAdapter(), ClaudeComputerUse(), OpenAIComputerUse(), GeminiComputerUse(), OwnEndpoint())}

__all__ = ["ADAPTERS", "AdapterOutcome", "AgentAdapter", "BrowserSession"]
