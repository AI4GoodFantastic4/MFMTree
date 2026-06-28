import { useEffect, useRef, useState } from "react";
import { TreePine } from "lucide-react";
import {
  type CellFeature,
  degradationLabel,
  getCellDisplayName,
  getCellTechnicalName,
  ndviLabel,
  plantsForElevation,
  scoreColor,
  type Weights,
} from "@/lib/cells";
import { compareAreas, type ComparisonResponse } from "@/lib/api";
import { ScoreBar } from "@/components/mfm/ScoreBar";
import {
  AIComparisonAdvisor,
  type ComparisonAdvisorResult,
  type VerdaState,
} from "@/components/mfm/AIComparisonAdvisor";

interface Props {
  scored: { feature: CellFeature; score: number }[];
  weights: Weights;
  aId: number | null;
  bId: number | null;
  onPickOnMap: (slot: "A" | "B") => void;
  onClear: (slot: "A" | "B") => void;
}

export function CompareTab({ scored, weights, aId, bId, onPickOnMap, onClear }: Props) {
  const a = aId == null ? undefined : scored.find((c) => c.feature.properties.grid_id === aId);
  const b = bId == null ? undefined : scored.find((c) => c.feature.properties.grid_id === bId);
  const [advisorState, setAdvisorState] = useState<VerdaState>("idle");
  const [advisorResult, setAdvisorResult] = useState<ComparisonAdvisorResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const recommendationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const areaAId = a?.feature.properties.area_id;
    const areaBId = b?.feature.properties.area_id;
    setAdvisorResult(null);
    setNote(null);
    setDismissed(false);
    if (!a || !b) {
      setAdvisorState("idle");
      return;
    }
    if (!areaAId || !areaBId) {
      setAdvisorState("recommendation");
      setAdvisorResult(buildLocalComparison(a, b));
      setNote("Local demo cells do not have backend area IDs; using local comparison.");
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    async function loadComparison() {
      setAdvisorState("thinking");
      timers.push(window.setTimeout(() => !cancelled && setAdvisorState("comparing"), 650));
      try {
        const result = await compareAreas(areaAId, areaBId);
        if (cancelled) return;
        const mapped = mapComparisonResult(result, a, b);
        setAdvisorResult(mapped);
        setAdvisorState("speaking");
      } catch (err) {
        if (!cancelled) {
          setAdvisorResult(buildLocalComparison(a, b));
          setAdvisorState("recommendation");
          setNote(
            err instanceof Error
              ? err.message
              : "Comparison endpoint unavailable; using local comparison.",
          );
        }
      }
    }

    loadComparison();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      if (recommendationTimerRef.current) window.clearTimeout(recommendationTimerRef.current);
    };
  }, [a?.feature.properties.area_id, a?.score, b?.feature.properties.area_id, b?.score]);

  const handleNarrativeComplete = () => {
    if (!advisorResult || advisorState !== "speaking") return;
    if (advisorResult.riskFlags?.length) {
      setAdvisorState("warning");
      if (recommendationTimerRef.current) window.clearTimeout(recommendationTimerRef.current);
      recommendationTimerRef.current = window.setTimeout(
        () => setAdvisorState("recommendation"),
        1200,
      );
      return;
    }
    setAdvisorState("recommendation");
  };

  return (
    <div className="h-full overflow-auto bg-[var(--mfm-bg)] p-4">
      <h2 className="mb-3 text-lg font-semibold text-[var(--mfm-text)]">Compare Candidate Areas</h2>
      {!dismissed && (
        <div className="mb-4">
          <AIComparisonAdvisor
            state={advisorState}
            result={advisorResult}
            note={note}
            onNarrativeComplete={handleNarrativeComplete}
            onDismiss={a && b ? () => setDismissed(true) : undefined}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Column
          label="AREA A"
          cell={a}
          onPick={() => onPickOnMap("A")}
          onClear={() => onClear("A")}
        />
        <Column
          label="AREA B"
          cell={b}
          onPick={() => onPickOnMap("B")}
          onClear={() => onClear("B")}
        />
      </div>
    </div>
  );
}

function mapComparisonResult(
  response: ComparisonResponse,
  a: { feature: CellFeature; score: number },
  b: { feature: CellFeature; score: number },
): ComparisonAdvisorResult {
  const aId = a.feature.properties.area_id;
  const bId = b.feature.properties.area_id;
  const areaAScore = aId ? response.scoresByArea?.[aId] : undefined;
  const areaBScore = bId ? response.scoresByArea?.[bId] : undefined;
  const recommendedAreaId = response.recommendedAreaId || pickRecommendedAreaId(response, a, b);
  const recommended = recommendedAreaId === bId ? b : a;
  const risks = unique([
    ...(response.riskFlags || []),
    ...(response.riskWarnings || []),
    ...((recommendedAreaId === aId ? areaAScore?.riskFlags : areaBScore?.riskFlags) || []),
    ...(recommended.feature.properties.risk_flags || []),
  ]);
  const keyTradeoffs =
    response.keyTradeoffs?.length || response.comparisonBullets?.length
      ? response.keyTradeoffs || response.comparisonBullets || []
      : deriveTradeoffs(a, b, areaAScore, areaBScore);
  const fieldValidationQuestions = response.fieldValidationQuestions?.length
    ? response.fieldValidationQuestions
    : defaultFieldQuestions();
  const recommendedAreaName = response.recommendedAreaName || labelForCell(recommended);

  return {
    recommendedAreaLabel: recommendedAreaName,
    confidence: response.confidence || confidenceFromScores(a.score, b.score),
    explanation: buildComparisonNarrative({
      summary: response.summary,
      narrativeSummary: response.narrativeSummary,
      llmExplanation: response.llmExplanation,
      recommendedAreaName,
      confidence: response.confidence || confidenceFromScores(a.score, b.score),
      keyTradeoffs,
      riskFlags: risks,
      fieldValidationQuestions,
    }),
    keyTradeoffs,
    riskFlags: risks,
    fieldValidationQuestions,
    decisionBasis: response.decisionBasis?.length
      ? response.decisionBasis
      : ["Priority score", "Carbon readiness", "Cost efficiency", "Risk flags"],
  };
}

function buildLocalComparison(
  a: { feature: CellFeature; score: number },
  b: { feature: CellFeature; score: number },
): ComparisonAdvisorResult {
  const recommended = a.score >= b.score ? a : b;
  const other = recommended === a ? b : a;
  return {
    recommendedAreaLabel: labelForCell(recommended),
    confidence: confidenceFromScores(a.score, b.score),
    explanation: buildComparisonNarrative({
      recommendedAreaName: labelForCell(recommended),
      confidence: confidenceFromScores(a.score, b.score),
      keyTradeoffs: deriveTradeoffs(a, b),
      riskFlags: unique([
        ...(recommended.feature.properties.risk_flags || []),
        ...(other.feature.properties.risk_flags || []),
      ]),
      fieldValidationQuestions: defaultFieldQuestions(),
    }),
    keyTradeoffs: deriveTradeoffs(a, b),
    riskFlags: unique([
      ...(recommended.feature.properties.risk_flags || []),
      ...(other.feature.properties.risk_flags || []),
    ]),
    fieldValidationQuestions: defaultFieldQuestions(),
    decisionBasis: ["Frontend score", "Cost proxy", "Readiness proxy", "Risk flags"],
  };
}

function buildComparisonNarrative(comparison: {
  summary?: string;
  narrativeSummary?: string;
  llmExplanation?: string;
  recommendedAreaName?: string;
  confidence?: string;
  keyTradeoffs?: string[];
  riskFlags?: string[];
  fieldValidationQuestions?: string[];
}) {
  if (comparison.summary) return comparison.summary;
  if (comparison.narrativeSummary) return comparison.narrativeSummary;
  if (comparison.llmExplanation) return comparison.llmExplanation;

  const recommended = comparison.recommendedAreaName || "the stronger candidate area";
  const confidence = comparison.confidence ? ` with ${comparison.confidence} confidence` : "";
  const tradeoffs = (comparison.keyTradeoffs || []).filter(Boolean);
  const risks = (comparison.riskFlags || []).filter(Boolean);
  const validations = (comparison.fieldValidationQuestions || []).slice(0, 2);
  const tradeoffText = tradeoffs.length
    ? `${tradeoffs.slice(0, 2).join(" ")}`
    : "The comparison suggests it has the stronger risk-adjusted profile for the first field visit.";
  const riskText = risks.length
    ? ` The main risk to check is ${risks[0].toLowerCase()}, so the team should treat this as a planning recommendation rather than final approval.`
    : " No major additional risk flag dominates the recommendation, but this is still only a pre-screening result.";
  const validationText = validations.length
    ? ` Experts should validate ${validations.map((item) => item.replace(/\.$/, "").toLowerCase()).join(" and ")} onsite.`
    : " Experts should validate land tenure, access, and local conditions onsite.";

  return `HabtamuAI recommends validating ${recommended} first${confidence}. ${tradeoffText}${riskText}${validationText}`;
}

function pickRecommendedAreaId(
  response: ComparisonResponse,
  a: { feature: CellFeature; score: number },
  b: { feature: CellFeature; score: number },
) {
  const aId = a.feature.properties.area_id;
  const bId = b.feature.properties.area_id;
  const aPriority = aId ? response.scoresByArea?.[aId]?.priorityScore : undefined;
  const bPriority = bId ? response.scoresByArea?.[bId]?.priorityScore : undefined;
  if (typeof aPriority === "number" && typeof bPriority === "number")
    return aPriority >= bPriority ? aId : bId;
  return a.score >= b.score ? aId : bId;
}

function deriveTradeoffs(
  a: { feature: CellFeature; score: number },
  b: { feature: CellFeature; score: number },
  areaAScore?: Partial<ComparisonResponse["scoresByArea"][string]>,
  areaBScore?: Partial<ComparisonResponse["scoresByArea"][string]>,
) {
  const pA = a.feature.properties;
  const pB = b.feature.properties;
  const tradeoffs = [
    scoreDelta(
      "Priority",
      areaAScore?.priorityScore ?? a.score,
      areaBScore?.priorityScore ?? b.score,
      labelForCell(a),
      labelForCell(b),
    ),
    scoreDelta(
      "Carbon",
      areaAScore?.carbonScore ?? pA.carbon_proxy,
      areaBScore?.carbonScore ?? pB.carbon_proxy,
      labelForCell(a),
      labelForCell(b),
    ),
    scoreDelta(
      "Cost efficiency",
      areaAScore?.costEfficiencyScore ?? pA.environmental_roi,
      areaBScore?.costEfficiencyScore ?? pB.environmental_roi,
      labelForCell(a),
      labelForCell(b),
    ),
    lowerIsBetter(
      "Risk",
      areaAScore?.riskScore ?? pA.risk_score ?? 50,
      areaBScore?.riskScore ?? pB.risk_score ?? 50,
      labelForCell(a),
      labelForCell(b),
    ),
  ];
  return tradeoffs.filter(Boolean).slice(0, 4);
}

function scoreDelta(
  label: string,
  aValue: number | undefined,
  bValue: number | undefined,
  aLabel: string,
  bLabel: string,
) {
  if (typeof aValue !== "number" || typeof bValue !== "number") return "";
  const delta = Math.abs(aValue - bValue);
  if (delta < 2) return `${label} is broadly similar between both areas.`;
  return `${aValue > bValue ? aLabel : bLabel} has stronger ${label.toLowerCase()} (${Math.round(Math.max(aValue, bValue))} vs ${Math.round(Math.min(aValue, bValue))}).`;
}

function lowerIsBetter(
  label: string,
  aValue: number | undefined,
  bValue: number | undefined,
  aLabel: string,
  bLabel: string,
) {
  if (typeof aValue !== "number" || typeof bValue !== "number") return "";
  const delta = Math.abs(aValue - bValue);
  if (delta < 2) return `${label} is broadly similar between both areas.`;
  return `${aValue < bValue ? aLabel : bLabel} has the lower ${label.toLowerCase()} signal (${Math.round(Math.min(aValue, bValue))} vs ${Math.round(Math.max(aValue, bValue))}).`;
}

function confidenceFromScores(aScore: number, bScore: number) {
  const delta = Math.abs(aScore - bScore);
  if (delta >= 10) return "high";
  if (delta >= 4) return "medium";
  return "low";
}

function labelForCell(cell: { feature: CellFeature; score: number }) {
  return getCellDisplayName(cell.feature.properties);
}

function technicalLabelForCell(cell: { feature: CellFeature; score: number }) {
  return getCellTechnicalName(cell.feature.properties) || cell.feature.properties.area_id || "";
}

function unique(items: (string | undefined)[]) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

function defaultFieldQuestions() {
  return [
    "Confirm actual plantable hectares and restoration boundaries.",
    "Confirm local seedling and labor costs.",
    "Confirm access, road constraints, and wet-season transport risk.",
    "Confirm land tenure, safeguards, and recent deforestation history.",
    "Confirm whether a carbon-credit pathway is realistic.",
  ];
}

function Column({
  label,
  cell,
  onPick,
  onClear,
}: {
  label: string;
  cell?: { feature: CellFeature; score: number };
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
          {label}
        </span>
        {cell && (
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--mfm-text-2)]">
            <span className="truncate font-mono">{technicalLabelForCell(cell)}</span>
            <button onClick={onClear} className="text-[#0070FF] hover:underline">
              × Change
            </button>
          </span>
        )}
      </div>
      <button
        onClick={onPick}
        className="mb-3 w-full rounded-md border border-[#0070FF] px-3 py-1.5 text-xs font-semibold text-[#0070FF] transition-colors hover:bg-[#0070FF] hover:text-white"
      >
        {cell ? "Select a different area on Map" : "Select on Map"}
      </button>
      {cell ? (
        <CellDetail cell={cell} />
      ) : (
        <p className="text-sm text-[var(--mfm-text-2)]">No candidate area selected.</p>
      )}
    </div>
  );
}

function CellDetail({ cell }: { cell: { feature: CellFeature; score: number } }) {
  const p = cell.feature.properties;
  const score = cell.score;
  const plants = plantsForElevation(p.elevation_m);
  return (
    <div>
      <div className="mb-3">
        <div className="text-sm font-semibold text-[var(--mfm-text)]">{getCellDisplayName(p)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-[var(--mfm-text-2)]">
          {getCellTechnicalName(p)}
        </div>
      </div>
      <div className="mb-3">
        <div className="text-3xl font-bold" style={{ color: scoreColor(score) }}>
          {score.toFixed(1)}
        </div>
        <span
          className="mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px]"
          style={{ borderColor: scoreColor(score), color: scoreColor(score) }}
        >
          {p.eligibility_status}
        </span>
      </div>
      <div className="space-y-2">
        <ScoreBar
          label="Priority score"
          value={score}
          previousValue={p.previous_priority_score}
          compact
        />
        <ScoreBar
          label="Carbon potential"
          value={p.carbon_proxy}
          previousValue={p.previous_carbon_score}
          compact
        />
        <ScoreBar
          label="Tree survival"
          value={p.water_soil_proxy}
          previousValue={p.previous_tree_survival_score}
          compact
        />
        <ScoreBar
          label="Cost efficiency"
          value={p.cost_efficiency_score ?? p.environmental_roi}
          previousValue={p.previous_cost_efficiency_score}
          compact
        />
        <ScoreBar
          label="Livelihood"
          value={p.livelihood_proxy}
          previousValue={p.previous_livelihood_score}
          compact
        />
        <ScoreBar
          label="Biodiversity"
          value={p.biodiversity_proxy}
          previousValue={p.previous_biodiversity_score}
          compact
        />
        <ScoreBar
          label="Risk"
          value={p.risk_score}
          previousValue={p.previous_risk_score}
          inverse
          compact
        />
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <Row k="NDVI" v={`${p.current_ndvi.toFixed(2)} — ${ndviLabel(p.current_ndvi)}`} />
        <Row
          k="Degradation"
          v={`${p.degradation_proxy.toFixed(2)} — ${degradationLabel(p.degradation_proxy)}`}
        />
        <Row k="Elevation" v={`${Math.round(p.elevation_m)} m`} />
        <Row k="Rainfall" v={`${Math.round(p.annual_rain_mm)} mm/yr`} />
        <Row k="Slope" v={`${p.slope_deg.toFixed(1)}°`} />
        <Row k="Carbon density" v={`${p.carbon_tonnes_per_ha_2010.toFixed(1)} t/ha`} />
        <Row k="Population (5km)" v={`${p.population_local_mean_5km.toFixed(1)} /km²`} />
        <Row
          k="Restorable"
          v={`${p.restorable_land_pct.toFixed(1)}% (${Math.round(p.target_project_area_ha).toLocaleString()} ha)`}
        />
        <Row k="Est. cost" v={`€${p.estimated_cost_million_eur.toFixed(2)}M`} />
        <Row k="ROI" v={`${p.environmental_roi.toFixed(1)}x`} />
      </dl>
      <p className="mt-3 text-xs text-[var(--mfm-text)]">{p.recommendation}</p>
      <div className="mt-3">
        <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
          Recommended Species
        </h5>
        <ul className="space-y-0.5 text-xs text-[var(--mfm-text)]">
          {plants.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <TreePine size={14} strokeWidth={1.5} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--mfm-border)]/50 py-1">
      <dt className="text-[var(--mfm-text-2)]">{k}</dt>
      <dd className="text-right font-mono text-[var(--mfm-text)]">{v}</dd>
    </div>
  );
}
