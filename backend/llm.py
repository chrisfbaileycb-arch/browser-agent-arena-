import json
import os
import uuid
from typing import Optional

from emergentintegrations.llm.chat import ImageContent, LlmChat, StreamDone, TextDelta, UserMessage

MODELS = {
    "gemini": ["gemini-3-flash-preview", "gemini-2.5-flash"],
    "openai": ["gpt-5.4-mini", "gpt-4.1-mini"],
    "anthropic": ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
}


def platform_model() -> tuple[str, str]:
    return os.environ["LLM_PROVIDER"], os.environ["LLM_MODEL"]


def parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError(f"LLM returned no JSON object: {text[:200]}")
    value = json.loads(text[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("LLM returned non-object JSON.")
    return value


async def ask_json(system: str, text: str, image_b64: Optional[str] = None, *, provider: Optional[str] = None,
                   model: Optional[str] = None, api_key: Optional[str] = None) -> dict:
    """provider/model/api_key come from the running user's key resolver; defaults are only used by the platform safety filter."""
    default_provider, default_model = platform_model()
    chat = LlmChat(api_key=api_key or os.environ["EMERGENT_LLM_KEY"], session_id=str(uuid.uuid4()), system_message=system
                   ).with_model(provider or default_provider, model or default_model)
    files = [ImageContent(image_base64=image_b64)] if image_b64 else None
    chunks = []
    async for event in chat.stream_message(UserMessage(text=text, file_contents=files)):
        if isinstance(event, TextDelta):
            chunks.append(event.content)
        elif isinstance(event, StreamDone):
            break
    return parse_json("".join(chunks))
