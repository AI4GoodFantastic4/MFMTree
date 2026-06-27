export type Area = {
  areaId: string;
  name: string;
  region: string;
  priorityScore: number;
  carbonScore: number;
  treeSurvivalScore: number;
  costEfficiencyScore: number;
  carbonCreditReadiness: "low" | "medium" | "high";
  livelihoodScore: number;
  biodiversityScore: number;
  riskScore: number;
  riskFlags: string[];
  recommendedAction: string;
  evidence: string[];
  uncertainties: string[];
  geometry?: unknown;
  indicators?: Record<string, unknown>;
};

export type CostEstimate = {
  areaId: string;
  estimatedPlantableHa: number;
  estimatedSeedlingsRequired: number;
  expectedSurvivingTrees: number;
  estimatedTotalCost: number;
  estimatedCostPerHa: number | null;
  estimatedCostPerSurvivingTree: number | null;
  estimatedNetTCO2e: number;
  estimatedCostPerTCO2e: number | null;
  currency: string;
  costConfidence: string;
  costDrivers: string[];
  costWarnings: string[];
};

export type ScenarioResponse = {
  scenario: string;
  areaIds?: string[];
  topAreaIds?: string[];
  scoresByArea?: Record<string, Partial<Area>>;
  analysis: string;
};

export type ScenarioRequest = {
  areaIds?: string[];
  name?: string;
  weights?: Record<string, number>;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export const mockAreas: Area[] = [
  {
    areaId: "ET-001",
    name: "Example Woreda",
    region: "Southwest Ethiopia",
    priorityScore: 86,
    carbonScore: 82,
    treeSurvivalScore: 78,
    costEfficiencyScore: 74,
    carbonCreditReadiness: "medium",
    livelihoodScore: 80,
    biodiversityScore: 68,
    riskScore: 22,
    riskFlags: ["biodiversity proxy only", "field validation required"],
    recommendedAction: "High-priority field validation",
    evidence: ["moderate rainfall reliability", "nearby communities", "manageable slope"],
    uncertainties: ["land tenure unknown", "species suitability needs local validation"],
  },
  {
    areaId: "ET-002",
    name: "Remote Carbon Highlands",
    region: "Southwest Ethiopia",
    priorityScore: 88,
    carbonScore: 92,
    treeSurvivalScore: 70,
    costEfficiencyScore: 48,
    carbonCreditReadiness: "medium",
    livelihoodScore: 70,
    biodiversityScore: 76,
    riskScore: 42,
    riskFlags: ["remote access", "field validation required"],
    recommendedAction: "High-carbon candidate with logistics review",
    evidence: ["high restoration carbon potential", "remote road access"],
    uncertainties: ["transport cost requires local validation"],
  },
  {
    areaId: "ET-003",
    name: "Accessible Lowland Buffer",
    region: "Oromia",
    priorityScore: 66,
    carbonScore: 55,
    treeSurvivalScore: 74,
    costEfficiencyScore: 88,
    carbonCreditReadiness: "low",
    livelihoodScore: 82,
    biodiversityScore: 52,
    riskScore: 28,
    riskFlags: ["lower carbon potential", "field validation required"],
    recommendedAction: "Low-cost validation candidate",
    evidence: ["near road access", "flat or gentle slope", "nearby communities"],
    uncertainties: ["carbon uplift may be modest"],
  },
  {
    areaId: "ET-004",
    name: "Recent Loss Watch Area",
    region: "Amhara",
    priorityScore: 79,
    carbonScore: 85,
    treeSurvivalScore: 62,
    costEfficiencyScore: 58,
    carbonCreditReadiness: "low",
    livelihoodScore: 64,
    biodiversityScore: 70,
    riskScore: 68,
    riskFlags: ["recent forest loss signal", "carbon integrity review required"],
    recommendedAction: "Do not prioritise before expert risk review",
    evidence: ["high carbon potential", "recent forest-loss signal"],
    uncertainties: ["carbon-credit eligibility uncertain", "land tenure unknown"],
  },
  {
    areaId: "ET-005",
    name: "Balanced Woreda Candidate",
    region: "SNNP",
    priorityScore: 76,
    carbonScore: 74,
    treeSurvivalScore: 76,
    costEfficiencyScore: 72,
    carbonCreditReadiness: "medium",
    livelihoodScore: 76,
    biodiversityScore: 62,
    riskScore: 33,
    riskFlags: ["field validation required"],
    recommendedAction: "Balanced candidate for validation shortlist",
    evidence: ["medium rainfall reliability", "manageable slope"],
    uncertainties: ["seedling supply cost needs local quote"],
  },
];

export async function getHealth() {
  return request<{ status: string; service: string }>("/health", { status: "mock", service: "mfmtree-api" });
}

export async function getAreas(): Promise<Area[]> {
  const data = await request<{ areas: Area[] }>("/areas", { areas: mockAreas });
  return data.areas || mockAreas;
}

export async function getArea(areaId: string): Promise<Area> {
  const fallback = mockAreas.find((area) => area.areaId === areaId) || mockAreas[0];
  return request<Area>(`/areas/${areaId}`, fallback);
}

export async function explainArea(areaId: string): Promise<string> {
  const fallback = mockExplanation(areaId);
  const data = await request<{ explanation: string }>(`/areas/${areaId}/explain`, { explanation: fallback }, "POST");
  return data.explanation || fallback;
}

export async function runScenario(weights: ScenarioRequest): Promise<ScenarioResponse> {
  const fallback = {
    scenario: weights.name || "Mock comparison",
    areaIds: weights.areaIds,
    scoresByArea: {},
    analysis: "Mock comparison ranks areas by priority, carbon return, access, and risk. Onsite validation remains required.",
  };
  return request<ScenarioResponse>("/scenario", fallback, "POST", weights);
}

export async function getScores(): Promise<Record<string, Partial<Area>>> {
  const data = await request<{ scoresByArea: Record<string, Partial<Area>> }>("/scores", { scoresByArea: {} });
  return data.scoresByArea || {};
}

export async function getCostEstimate(areaId: string): Promise<CostEstimate | null> {
  const fallback = mockCostEstimate(areaId);
  return request<CostEstimate>(`/areas/${areaId}/cost-estimate`, fallback);
}

export async function getFieldBrief(areaId: string): Promise<string> {
  const fallback = "Validate plantable area, local seedling cost, labor availability, access, rainfall, land tenure, recent forest-loss history, and carbon-credit pathway realism.";
  const data = await request<{ fieldBrief: string }>(`/areas/${areaId}/field-brief`, { fieldBrief: fallback }, "POST");
  return data.fieldBrief || fallback;
}

async function request<T>(path: string, fallback: T, method = "GET", body?: unknown): Promise<T> {
  if (!API_BASE_URL) return fallback;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`API fallback for ${path}:`, error);
    return fallback;
  }
}

function mockExplanation(areaId: string) {
  const area = mockAreas.find((item) => item.areaId === areaId) || mockAreas[0];
  return `${area.name} is a pre-screening candidate with priority score ${area.priorityScore}. The main evidence is ${area.evidence.join(", ")}. Uncertainties remain: ${area.uncertainties.join(", ")}. This is not final approval; onsite expert validation is required.`;
}

function mockCostEstimate(areaId: string): CostEstimate {
  const area = mockAreas.find((item) => item.areaId === areaId) || mockAreas[0];
  const plantable = 900 + area.priorityScore * 5;
  const total = Math.round(plantable * (850 + (100 - area.costEfficiencyScore) * 8));
  const tco2e = Math.round(plantable * 42);
  return {
    areaId: area.areaId,
    estimatedPlantableHa: plantable,
    estimatedSeedlingsRequired: plantable * 1100,
    expectedSurvivingTrees: Math.round(plantable * 1100 * (area.treeSurvivalScore / 100)),
    estimatedTotalCost: total,
    estimatedCostPerHa: Math.round(total / plantable),
    estimatedCostPerSurvivingTree: 1.2,
    estimatedNetTCO2e: tco2e,
    estimatedCostPerTCO2e: Number((total / tco2e).toFixed(2)),
    currency: "EUR",
    costConfidence: area.riskScore > 55 ? "low" : "medium",
    costDrivers: area.riskFlags,
    costWarnings: ["Uses configurable planning assumptions", "Requires onsite expert validation"],
  };
}
