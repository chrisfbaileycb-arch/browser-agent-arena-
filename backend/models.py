from typing import Annotated, Any, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    def to_mongo(self) -> dict:
        doc = self.model_dump(by_alias=True)
        oid = doc.pop("_id", None)
        if oid:
            doc["_id"] = ObjectId(oid)
        return doc

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)


class Step(BaseModel):
    n: int
    at: str
    action: str
    target: str = ""
    target_label: str = ""
    value: str = ""
    reasoning: str = ""
    ok: bool = True
    detail: str = ""
    url: str = ""
    screenshot: str = ""
    llm_ms: int = 0


class Run(BaseDocument):
    kind: str
    adapter: str = "crab"
    user_id: Optional[str] = None
    crab_id: Optional[str] = None
    profile: dict[str, Any] = {}
    is_public: bool = False
    champion_label: Optional[str] = None
    assertions: list[dict[str, Any]] = []
    course_id: Optional[str] = None
    attempt_id: Optional[str] = None
    target_url: str
    display_url: str
    goal: str
    status: str = "queued"
    model: str = ""
    safety: dict[str, Any] = {}
    steps: list[Step] = []
    hints: list[dict[str, Any]] = []
    steps_used: int = 0
    max_steps: int
    timeout_s: float
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    elapsed_s: Optional[float] = None
    end_reason: Optional[str] = None
    agent_result: Optional[str] = None
    verification: Optional[dict[str, Any]] = None
    score: Optional[dict[str, Any]] = None
    jev: Optional[dict[str, Any]] = None
    final_screenshot: Optional[str] = None
    error: Optional[str] = None


class CourseAttempt(BaseDocument):
    course_id: str
    agent_label: str
    user_id: Optional[str] = None
    recording_url: Optional[str] = None
    run_id: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    cleared: list[str] = []
    decoys: int = 0
    events: list[dict[str, Any]] = []
    nonces: dict[str, str]
    code: Optional[str] = None
    submitted_code: Optional[str] = None
    submitted_at: Optional[str] = None
    verified: Optional[bool] = None
    score: Optional[dict[str, Any]] = None


class RunCreate(BaseModel):
    url: Optional[str] = Field(default=None, max_length=2000)
    course_id: Optional[str] = Field(default=None, max_length=60)
    goal: Optional[str] = Field(default=None, max_length=600)
    adapter: str = Field(default="crab", max_length=40)
    crab_id: Optional[str] = Field(default=None, max_length=40)
    assertions: list[dict[str, Any]] = Field(default=[], max_length=20)

    @model_validator(mode="after")
    def one_target(self):
        if bool(self.url) == bool(self.course_id):
            raise ValueError("Provide exactly one of url or course_id.")
        if self.url and not (self.goal and self.goal.strip()):
            raise ValueError("A goal is required when running against a URL.")
        return self


class AttemptCreate(BaseModel):
    course_id: str = Field(max_length=60)
    agent_label: str = Field(default="external", min_length=1, max_length=80)


class StationAction(BaseModel):
    station: str = Field(max_length=40)
    nonce: str = Field(max_length=40)


class CodeSubmission(BaseModel):
    code: str = Field(min_length=1, max_length=400)
    steps: Optional[int] = Field(default=None, ge=0, le=10000)
    recording_url: Optional[str] = Field(default=None, max_length=500, pattern=r"^https?://")


class SafetyRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class Crab(BaseDocument):
    user_id: str
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="#FF5A4E", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent: str = Field(default="#FFD23F", pattern=r"^#[0-9A-Fa-f]{6}$")
    accessory: str = Field(default="none", pattern=r"^(none|cap|crown|goggles|headset|bow|helmet)$")
    skills: list[str] = Field(default=[], max_length=8)
    personality: str = Field(default="focused", max_length=120)
    system_prompt: str = Field(default="", max_length=1500)
    provider: str = Field(default="gemini", pattern=r"^(gemini|openai|anthropic)$")
    model: str = Field(default="gemini-3-flash-preview", max_length=60)
    xp: int = 0
    runs: int = 0
    wins: int = 0
    memory: list[str] = []
    is_champion: bool = False
    created_at: str = ""


class CrabInput(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="#FF5A4E", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent: str = Field(default="#FFD23F", pattern=r"^#[0-9A-Fa-f]{6}$")
    accessory: str = Field(default="none", pattern=r"^(none|cap|crown|goggles|headset|bow|helmet)$")
    skills: list[str] = Field(default=[], max_length=8)
    personality: str = Field(default="focused", max_length=120)
    system_prompt: str = Field(default="", max_length=1500)
    provider: str = Field(default="gemini", pattern=r"^(gemini|openai|anthropic)$")
    model: str = Field(default="gemini-3-flash-preview", max_length=60)


class ChallengeInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    draft: dict[str, Any]


class WorkflowRequest(BaseModel):
    objective: str = Field(min_length=3, max_length=2000)
    workflow: dict[str, Any]
    target_url: Optional[str] = Field(default=None, max_length=2000)
    dispatch_url: Optional[str] = Field(default=None, max_length=2000)
