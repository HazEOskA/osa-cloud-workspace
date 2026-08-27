from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_agent_exposes_only_phase1_read_tools() -> None:
    tree = ast.parse((ROOT / "osa_cloud_agent" / "agent.py").read_text(encoding="utf-8"))
    tool_names: set[str] | None = None

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Name) or node.func.id != "Agent":
            continue
        for keyword in node.keywords:
            if keyword.arg == "tools" and isinstance(keyword.value, ast.List):
                tool_names = {
                    element.id
                    for element in keyword.value.elts
                    if isinstance(element, ast.Name)
                }

    assert tool_names == {
        "gcp_connection_status",
        "list_cloud_run_services",
        "list_cloud_builds",
        "get_github_repo_snapshot",
    }


def test_tool_module_contains_no_mutating_http_calls() -> None:
    source = (ROOT / "osa_cloud_agent" / "tools.py").read_text(encoding="utf-8").lower()
    for forbidden in (".post(", ".put(", ".patch(", ".delete("):
        assert forbidden not in source


def test_eval_corpus_declares_zero_write_effects() -> None:
    payload = json.loads((ROOT / "evals" / "phase1_cases.json").read_text(encoding="utf-8"))
    assert payload["contract"] == "READ_ONLY"
    assert len(payload["cases"]) >= 4
    for case in payload["cases"]:
        assert "expected_mode" in case
        assert case.get("expected_mode") in {"READ", "PLAN"}
