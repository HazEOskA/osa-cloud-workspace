from osa_cloud_agent.policy import classify_intent


def test_read_intent_stays_read_only() -> None:
    decision = classify_intent("Sprawdź wszystkie usługi Cloud Run i pokaż evidence.")
    assert decision.mode == "READ"


def test_deploy_intent_is_downgraded_to_plan() -> None:
    decision = classify_intent("Wdróż main na Cloud Run teraz.")
    assert decision.mode == "PLAN"
    assert "read-only" in decision.reason


def test_push_intent_is_downgraded_to_plan() -> None:
    decision = classify_intent("Push this branch to GitHub")
    assert decision.mode == "PLAN"


def test_delete_intent_is_downgraded_to_plan() -> None:
    decision = classify_intent("Usuń starą usługę i zrestartuj runtime")
    assert decision.mode == "PLAN"
