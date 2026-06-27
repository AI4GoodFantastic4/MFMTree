import json
import os
from typing import Any


def generate_area_explanation(area: dict[str, Any], cost_estimate: dict[str, Any] | None = None) -> str:
    prompt = _base_prompt(
        "Explain why this area received its current reforestation priority score.",
        {"area": area, "costEstimate": cost_estimate},
    )
    return _invoke_or_mock(prompt, _mock_area_explanation(area, cost_estimate))


def generate_field_brief(area: dict[str, Any], cost_estimate: dict[str, Any] | None = None) -> str:
    prompt = _base_prompt(
        "Create a short field brief for NGO staff preparing onsite validation.",
        {"area": area, "costEstimate": cost_estimate},
    )
    return _invoke_or_mock(prompt, _mock_field_brief(area, cost_estimate))


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
            "- Do not invent cost numbers.",
            "- Use only the provided evidence and fields.",
            "- Explain uncertainty clearly.",
            "- Frame output as pre-screening, not final approval.",
            "- Mention that onsite expert validation is required.",
            "- If a cost estimate is provided, explain the main cost drivers and assumptions that need validation.",
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


def _mock_area_explanation(area: dict[str, Any], cost_estimate: dict[str, Any] | None = None) -> str:
    evidence = "; ".join(area.get("evidence", [])) or "no evidence supplied"
    uncertainties = "; ".join(area.get("uncertainties", [])) or "no uncertainty supplied"
    cost_sentence = ""
    if cost_estimate:
        drivers = "; ".join(cost_estimate.get("costDrivers", [])[:3])
        cost_sentence = (
            f" Estimated total cost is {cost_estimate['estimatedTotalCost']} "
            f"{cost_estimate['currency']} with {cost_estimate['costConfidence']} confidence. "
            f"Main cost drivers: {drivers}."
        )
    return (
        f"{area['name']} is a pre-screening priority because the scoring engine assigned "
        f"a priority score of {area['priorityScore']} using the provided indicators. "
        f"Supporting evidence: {evidence}. Key uncertainties: {uncertainties}.{cost_sentence} "
        "This is not final approval; onsite expert validation is required."
    )


def _mock_field_brief(area: dict[str, Any], cost_estimate: dict[str, Any] | None = None) -> str:
    flags = ", ".join(area.get("riskFlags", [])) or "none listed"
    cost_line = ""
    if cost_estimate:
        cost_line = (
            f" Planning estimate: {cost_estimate['estimatedTotalCost']} {cost_estimate['currency']} total, "
            f"{cost_estimate['estimatedCostPerHa']} per plantable ha, "
            f"{cost_estimate['estimatedCostPerSurvivingTree']} per surviving tree. "
        )
    return (
        f"Field brief for {area['name']}: {cost_line}"
        "confirm actual plantable hectares, local seedling cost, local labor availability and cost, "
        "road/access constraints, water/rainfall constraints, land tenure, recent deforestation history, "
        "and whether a carbon-credit pathway is realistic. "
        f"Also validate species suitability, community priorities, and risk flags ({flags}). "
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
