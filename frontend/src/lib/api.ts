import { CELLS, type CellFeature, type CellProps } from "@/lib/cells";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export type BackendArea = {
  areaId: string;
  name?: string;
  region?: string;
  priorityScore?: number;
  carbonScore?: number;
  treeSurvivalScore?: number;
  costEfficiencyScore?: number;
  carbonCreditReadiness?: "low" | "medium" | "high";
  livelihoodScore?: number;
  biodiversityScore?: number;
  riskScore?: number;
  riskFlags?: string[];
  recommendedAction?: string;
  evidence?: string[];
  uncertainties?: string[];
  indicators?: Record<string, unknown>;
};

export type CostEstimate = {
  areaId: string;
  estimatedPlantableHa: number;
  estimatedTotalCost: number;
  estimatedCostPerHa: number | null;
  estimatedCostPerTCO2e: number | null;
  currency: string;
  costConfidence: string;
  costDrivers: string[];
  costWarnings: string[];
};

export type GeoJsonFeature = {
  type: "Feature";
  properties: { areaId?: string; name?: string; region?: string; [key: string]: unknown };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

export type AreasResponse = {
  areas: BackendArea[];
  geojson?: { type: "FeatureCollection"; features: GeoJsonFeature[] };
  source?: string;
};

export type ScenarioResponse = {
  analysis?: string;
  scoresByArea?: Record<string, Partial<BackendArea>>;
  topAreaIds?: string[];
  source?: string;
};

export type ComparisonResponse = ScenarioResponse & {
  areaIds?: string[];
  recommendedAreaId?: string;
  recommendedAreaName?: string;
  recommendation?: string;
  confidence?: "low" | "medium" | "high" | string;
  summary?: string;
  narrativeSummary?: string;
  keyTradeoffs?: string[];
  comparisonBullets?: string[];
  riskFlags?: string[];
  riskWarnings?: string[];
  llmExplanation?: string;
  fieldValidationQuestions?: string[];
  decisionBasis?: string[];
  caveat?: string;
};

export type AreaExplanationResponse = {
  areaId: string;
  summary?: string;
  explanation?: string;
  recommendation?: string;
  evidenceBullets?: string[];
  risks?: string[];
  riskFlags?: string[];
  uncertainties?: string[];
  caveat?: string;
  carbonCreditReadiness?: string;
  costEstimate?: CostEstimate;
};

export async function getHealth() {
  return request<{ status: string; service: string }>("/health");
}

export async function getAreas(): Promise<AreasResponse> {
  return request<AreasResponse>("/areas");
}

export async function getArea(areaId: string): Promise<BackendArea> {
  return request<BackendArea>(`/areas/${areaId}`);
}

export async function getScores(): Promise<Record<string, Partial<BackendArea>>> {
  const data = await request<{ scoresByArea: Record<string, Partial<BackendArea>> }>("/scores");
  return data.scoresByArea || {};
}

export async function getCostEstimate(areaId: string): Promise<CostEstimate> {
  return request<CostEstimate>(`/areas/${areaId}/cost-estimate`);
}

export async function explainArea(areaId: string): Promise<string> {
  const data = await request<AreaExplanationResponse>(`/areas/${areaId}/explain`, "POST");
  return data.summary || data.explanation || "No explanation returned.";
}

export async function getFieldBrief(areaId: string): Promise<string> {
  const data = await request<{ fieldBrief: string }>(`/areas/${areaId}/field-brief`, "POST");
  return data.fieldBrief || "";
}

export async function compareAreas(areaAId: string, areaBId: string): Promise<ComparisonResponse> {
  return request<ComparisonResponse>("/compare-areas", "POST", { areaIds: [areaAId, areaBId] });
}

export async function runScenario(weights: Record<string, number>): Promise<ScenarioResponse> {
  return request<ScenarioResponse>("/scenario", "POST", { weights });
}

export async function getBudgetPlan(payload: Record<string, unknown>) {
  return request("/budget-plan", "POST", payload);
}

export async function synthesizeSpeech(text: string): Promise<Blob> {
  const data = await request<{ audioBase64: string; contentType: string }>("/voice", "POST", { text });
  const binary = atob(data.audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: data.contentType || "audio/mpeg" });
}

export async function loadBackendCells(): Promise<{ cells: CellFeature[]; source: string; usingDemoData: boolean }> {
  if (!API_BASE_URL) {
    return { cells: CELLS, source: "local demo", usingDemoData: true };
  }

  const [areasPayload, scoresByArea] = await Promise.all([getAreas(), getScores()]);
  const cells = backendAreasToCells(areasPayload, scoresByArea);
  if (!cells.length) throw new Error("Backend returned no renderable areas.");
  return { cells, source: areasPayload.source || "api", usingDemoData: false };
}

export function mergeBackendScores(cells: CellFeature[], scoresByArea: Record<string, Partial<BackendArea>>): CellFeature[] {
  return cells.map((cell) => {
    const areaId = cell.properties.area_id;
    if (!areaId || !scoresByArea[areaId]) return cell;
    return {
      ...cell,
      properties: {
        ...cell.properties,
        ...areaToCellScoreProps({ areaId, ...scoresByArea[areaId] }),
      },
    };
  });
}

export function frontendWeightsToBackend(weights: { carbon: number; biodiversity: number; livelihood: number; water_soil: number }) {
  return {
    carbon: weights.carbon,
    biodiversity: weights.biodiversity,
    livelihood: weights.livelihood,
    survival: weights.water_soil,
    costEfficiency: 0.15,
    riskPenalty: 0.08,
  };
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!API_BASE_URL) throw new Error("VITE_API_BASE_URL is not configured.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

function backendAreasToCells(payload: AreasResponse, scoresByArea: Record<string, Partial<BackendArea>>): CellFeature[] {
  const areasById = new Map(payload.areas.map((area) => [area.areaId, { ...area, ...(scoresByArea[area.areaId] || {}) }]));
  const features = payload.geojson?.features || [];

  return features
    .map((feature, index) => {
      const areaId = feature.properties.areaId;
      if (!areaId) return null;
      const area = areasById.get(areaId) || { areaId, name: feature.properties.name, region: feature.properties.region };
      const polygon = normalizePolygon(feature.geometry.coordinates);
      if (!polygon) return null;
      return {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: polygon },
        properties: {
          ...defaultCellProps(area, index),
          ...areaToCellScoreProps(area),
        },
      };
    })
    .filter((feature): feature is CellFeature => Boolean(feature));
}

function defaultCellProps(area: BackendArea, index: number): CellProps {
  const indicators = area.indicators || {};
  const plantableFraction = numberValue(indicators.plantableFraction, 0.65);
  const totalAreaHa = numberValue(indicators.totalAreaHa, 1000 + index * 150);
  const expectedTco2e = numberValue(indicators.expectedTCO2ePerHa, 68);
  const survival = numberValue(indicators.expectedSurvivalRate, 0.72);
  const slope = numberValue(indicators.meanSlopeDeg, 8);
  const rainfall = rainfallToMm(indicators.rainfallReliability);
  const costPerHa = 450 + numberValue(indicators.distanceToRoadKm, 10) * 18 + slope * 8;
  const targetHa = totalAreaHa * plantableFraction;
  const totalCost = (targetHa * costPerHa) / 1_000_000;

  return {
    grid_id: areaIdToGridId(area.areaId, index),
    area_id: area.areaId,
    name: area.name || area.areaId,
    region: area.region || "Ethiopia",
    restoration_score: numberValue(area.priorityScore, 50),
    roi_class: roiClass(numberValue(area.priorityScore, 50)),
    priority_category: area.recommendedAction || "Candidate for expert validation",
    carbon_proxy: numberValue(area.carbonScore, expectedTco2e),
    biodiversity_proxy: numberValue(area.biodiversityScore, 55),
    livelihood_proxy: numberValue(area.livelihoodScore, 60),
    water_soil_proxy: numberValue(area.treeSurvivalScore, survival * 100),
    current_ndvi: numberValue(indicators.meanNdvi, 0.35),
    degradation_proxy: Math.abs(numberValue(indicators.vegetationTrend, -0.1)),
    elevation_m: numberValue(indicators.elevationM, 1800),
    annual_rain_mm: rainfall,
    estimated_cost_million_eur: totalCost,
    environmental_roi: totalCost > 0 ? (targetHa * expectedTco2e * survival) / (totalCost * 1_000_000) : 0,
    restorable_land_pct: plantableFraction * 100,
    target_project_area_ha: targetHa,
    area_ha: totalAreaHa,
    eligibility_status: area.carbonCreditReadiness ? `Carbon readiness: ${area.carbonCreditReadiness}` : "Expert validation required",
    recommendation: area.recommendedAction || "Candidate for expert validation",
    candidate_ok: area.riskScore && area.riskScore > 60 ? 0 : 1,
    carbon_tonnes_per_ha_2010: expectedTco2e,
    slope_deg: slope,
    population_local_mean_5km: numberValue(indicators.populationNearby, 9000) / 1000,
    settlement_pressure_1km_pct: numberValue(indicators.populationNearby, 9000) / 300,
    near_protected_area: String(indicators.protectedAreaConcern || "low").toLowerCase() === "low" ? 0 : 1,
    plant_fit: survival * 100,
    carbon_credit_readiness: area.carbonCreditReadiness,
    risk_score: area.riskScore,
    risk_flags: area.riskFlags || [],
    evidence: area.evidence || [],
    uncertainties: area.uncertainties || [],
  };
}

function areaToCellScoreProps(area: Partial<BackendArea> & { areaId?: string }): Partial<CellProps> {
  const priority = numberValue(area.priorityScore, undefined);
  return {
    backend_priority_score: priority,
    restoration_score: priority ?? undefined,
    roi_class: priority === undefined ? undefined : roiClass(priority),
    priority_category: area.recommendedAction,
    carbon_proxy: numberValue(area.carbonScore, undefined),
    biodiversity_proxy: numberValue(area.biodiversityScore, undefined),
    livelihood_proxy: numberValue(area.livelihoodScore, undefined),
    water_soil_proxy: numberValue(area.treeSurvivalScore, undefined),
    eligibility_status: area.carbonCreditReadiness ? `Carbon readiness: ${area.carbonCreditReadiness}` : undefined,
    recommendation: area.recommendedAction,
    candidate_ok: area.riskScore && area.riskScore > 60 ? 0 : 1,
    carbon_credit_readiness: area.carbonCreditReadiness,
    risk_score: area.riskScore,
    risk_flags: area.riskFlags,
  };
}

function normalizePolygon(coordinates: unknown): number[][][] | null {
  if (!Array.isArray(coordinates)) return null;
  const polygon = Array.isArray(coordinates[0]?.[0]?.[0]) ? coordinates[0] : coordinates;
  if (!Array.isArray(polygon?.[0])) return null;
  return polygon as number[][][];
}

function areaIdToGridId(areaId: string, index: number) {
  const digits = areaId.match(/\d+/g)?.join("");
  return digits ? Number(digits) : index + 1;
}

function numberValue(value: unknown, fallback: number): number;
function numberValue(value: unknown, fallback: undefined): number | undefined;
function numberValue(value: unknown, fallback: number | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function rainfallToMm(value: unknown) {
  const label = String(value || "medium").toLowerCase();
  if (label === "high") return 1150;
  if (label === "low") return 520;
  return 780;
}

function roiClass(score: number): "Green" | "Yellow" | "Red" {
  if (score >= 80) return "Green";
  if (score >= 65) return "Yellow";
  return "Red";
}
