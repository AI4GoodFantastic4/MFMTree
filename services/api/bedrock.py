import json
import os
from typing import Any


def generate_area_explanation(area: dict[str, Any]) -> str:
    prompt = _base_prompt(
        "Explain why this area received its current reforestation priority score.",
        {"area": area},
    )
    return _invoke_or_mock(prompt, _mock_area_explanation(area))


def generate_field_brief(area: dict[str, Any]) -> str:
    prompt = _base_prompt(
        "Create a short field brief for NGO staff preparing onsite validation.",
        {"area": area},
    )
    return _invoke_or_mock(prompt, _mock_field_brief(area))


def compare_areas(area_a: dict[str, Any], area_b: dict[str, Any]) -> str:
    prompt = _base_prompt(
        "Compare these two areas for reforestation pre-screening priority.",
        {"area_a": area_a, "area_b": area_b},
    )
    return _invoke_or_mock(prompt, _mock_comparison(area_a, area_b))


def _base_prompt(task: str, payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "You support NGO staff evaluating potential reforestation areas in Ethiopia.",
            task,
            "Rules:",
            "- Do not invent scores.",
            "- Use only the provided evidence and fields.",
            "- Explain uncertainty clearly.",
            "- Frame output as pre-screening, not final approval.",
            "- Mention that onsite expert validation is required.",
            "- Keep output concise and NGO-friendly.",
            "Data:",
            json.dumps(payload, ensure_ascii=True, indent=2),
        ]
    )


def _invoke_or_mock(prompt: str, fallback: str) -> str:
    enabled = os.environ.get("BEDROCK_ENABLED", "false").lower() == "true"
    if not enabled:
        return fallback

    try:
        import boto3

        model_id = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20240620-v1:0")
        client = boto3.client("bedrock-runtime")
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 500,
                    "temperature": 0.2,
                    "messages": [
                        {
                            "role": "user",
                            "content": [{"type": "text", "text": prompt}],
                        }
                    ],
                }
            ),
        )
        body = json.loads(response["body"].read())
        content = body.get("content", [])
        if content and isinstance(content, list):
            return "\n".join(part.get("text", "") for part in content if part.get("type") == "text").strip()
    except Exception as exc:
        print(f"Bedrock call failed; using deterministic fallback: {exc}")

    return fallback


def _mock_area_explanation(area: dict[str, Any]) -> str:
    evidence = "; ".join(area.get("evidence", [])) or "no evidence supplied"
    uncertainties = "; ".join(area.get("uncertainties", [])) or "no uncertainty supplied"
    return (
        f"{area['name']} is a pre-screening priority because the scoring engine assigned "
        f"a priority score of {area['priorityScore']} using the provided indicators. "
        f"Supporting evidence: {evidence}. Key uncertainties: {uncertainties}. "
        "This is not final approval; onsite expert validation is required."
    )


def _mock_field_brief(area: dict[str, Any]) -> str:
    flags = ", ".join(area.get("riskFlags", [])) or "none listed"
    return (
        f"Field brief for {area['name']}: validate land tenure, species suitability, "
        f"community priorities, slope/access assumptions, and risk flags ({flags}). "
        f"The current recommended action is: {area['recommendedAction']}. "
        "Use this as pre-screening only; onsite expert validation is required."
    )


def _mock_comparison(area_a: dict[str, Any], area_b: dict[str, Any]) -> str:
    winner = area_a if area_a["priorityScore"] >= area_b["priorityScore"] else area_b
    other = area_b if winner is area_a else area_a
    return (
        f"{winner['name']} ranks higher in pre-screening with priority score "
        f"{winner['priorityScore']} versus {other['priorityScore']} for {other['name']}. "
        "Compare the listed evidence and uncertainties before allocating field effort. "
        "This comparison is not final approval; onsite expert validation is required."
    )
