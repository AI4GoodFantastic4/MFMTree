import json
import os
from typing import Any


def generate_area_explanation(area: dict[str, Any], cost_estimate: dict[str, Any] | None = None) -> str:
    prompt = _base_prompt(
        (
            "Write a 3-5 sentence area explanation for NGO staff. "
            "Start with whether the area should be validated soon, explain the main evidence and risks, "
            "and do not use markdown headings or tables."
        ),
        {"area": _compact_area(area), "costEstimate": cost_estimate},
    )
    return _invoke_or_mock(prompt, _mock_area_explanation(area, cost_estimate))


def generate_field_brief(area: dict[str, Any], cost_estimate: dict[str, Any] | None = None) -> str:
    prompt = _base_prompt(
        "Create a short field brief for NGO staff preparing onsite validation.",
        {"area": _compact_area(area), "costEstimate": cost_estimate},
    )
    return _invoke_or_mock(prompt, _mock_field_brief(area, cost_estimate))


def compare_areas(
    area_a: dict[str, Any],
    area_b: dict[str, Any],
    cost_a: dict[str, Any] | None = None,
    cost_b: dict[str, Any] | None = None,
) -> str:
    recommended = area_a if area_a.get("priorityScore", 0) >= area_b.get("priorityScore", 0) else area_b
    prompt = _base_prompt(
        (
            "Write a natural human-language comparison summary for these two areas. "
            "Use 3-5 sentences. Mention the deterministic recommended area, the main tradeoff, "
            "uncertainty or onsite validation, and avoid JSON or bullet points. "
            "Do not sound too technical. Do not overrule the deterministic recommendation."
        ),
        {
            "deterministicRecommendation": {
                "recommendedAreaId": recommended.get("areaId"),
                "recommendedAreaName": recommended.get("name"),
                "reason": "The backend scoring engine selected this area by priority score and risk-adjusted indicators.",
            },
            "area_a": _compact_area(area_a),
            "area_a_costEstimate": cost_a,
            "area_b": _compact_area(area_b),
            "area_b_costEstimate": cost_b,
        },
    )
    return _invoke_or_mock(prompt, _mock_comparison(area_a, area_b))


def _compact_area(area: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "areaId",
        "name",
        "region",
        "priorityScore",
        "carbonScore",
        "treeSurvivalScore",
        "costEfficiencyScore",
        "carbonCreditReadiness",
        "livelihoodScore",
        "biodiversityScore",
        "riskScore",
        "riskFlags",
        "recommendedAction",
        "evidence",
        "uncertainties",
    )
    indicators = area.get("indicators") or area.get("costIndicators") or {}
    indicator_keys = (
        "totalAreaHa",
        "plantableFraction",
        "targetProjectAreaHa",
        "meanNdvi",
        "meanNdmi",
        "vegetationTrend",
        "recentDeforestationRisk",
        "forestLossRecent",
        "rainfallReliability",
        "meanSlopeDeg",
        "soilSuitability",
        "distanceToRoadKm",
        "protectedAreaConcern",
        "populationNearby",
        "monitoringFeasibility",
        "expectedSurvivalRate",
        "expectedTCO2ePerHa",
        "restorationGainPct",
        "carbonGainPct",
        "habitatRecoveryGainPct",
        "restorationAdditionalityPct",
        "validCandidate10yClearedPct",
        "restorationSystemCode",
        "mrvReadinessPct",
        "remoteSensingUncertaintyPct",
        "hardExclusion",
        "ecologicalReviewRequired",
        "socialReviewRequired",
        "landHistoryReviewRequired",
        "mrvReviewRequired",
    )
    return {
        **{key: area.get(key) for key in keys if area.get(key) is not None},
        "indicators": {key: indicators.get(key) for key in indicator_keys if indicators.get(key) is not None},
    }


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
            "- Do not claim to issue, certify, or guarantee carbon credits.",
            "- Explain that carbon-credit readiness is only a preliminary signal.",
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

        model_id = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")
        client = boto3.client("bedrock-runtime")
        response = client.converse(
            modelId=model_id,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ],
            inferenceConfig={"maxTokens": 500, "temperature": 0.2},
        )
        content = response.get("output", {}).get("message", {}).get("content", [])
        if content and isinstance(content, list):
            text = "\n".join(part.get("text", "") for part in content if part.get("text")).strip()
            if text:
                print(f"Bedrock call succeeded with model: {model_id}")
                return text
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
