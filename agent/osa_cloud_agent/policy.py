from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

AgentMode = Literal["READ", "PLAN"]

_MUTATION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bdeploy\b",
        r"\bredeploy\b",
        r"\bpush\b",
        r"\bcommit\b",
        r"\bdelete\b",
        r"\brestart\b",
        r"\bupdate\b",
        r"\bcreate\b",
        r"\bwrite\b",
        r"\bzmień\b",
        r"\bzmien\b",
        r"\busuń\b",
        r"\busun\b",
        r"\butwórz\b",
        r"\butworz\b",
        r"\bwdr[oó]ż\b",
        r"\bwypchnij\b",
        r"\bzrestartuj\b",
    )
]


@dataclass(frozen=True)
class IntentDecision:
    mode: AgentMode
    reason: str


def classify_intent(message: str) -> IntentDecision:
    """Classify user intent without granting execution authority.

    Phase 1 is structurally read-only. Mutation-looking requests are downgraded
    to PLAN so the model may explain a proposed action but cannot execute it.
    """
    normalized = " ".join(message.split())
    if any(pattern.search(normalized) for pattern in _MUTATION_PATTERNS):
        return IntentDecision(
            mode="PLAN",
            reason="Phase 1 is read-only; mutation intent may only produce a plan.",
        )
    return IntentDecision(mode="READ", reason="Read-only diagnostic or analysis request.")


def assert_read_tool(tool_name: str, allowed_tools: set[str]) -> None:
    if tool_name not in allowed_tools:
        raise PermissionError(f"Tool {tool_name!r} is not allowed in OSA Cloud Agent Phase 1.")
