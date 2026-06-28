import raw from "@/data/cells.geojson.json";

export interface CellProps {
  grid_id: number;
  area_id?: string;
  name?: string;
  region?: string;
  backend_priority_score?: number;
  restoration_score: number;
  roi_class: "Green" | "Yellow" | "Red";
  priority_category: string;
  carbon_proxy: number;
  biodiversity_proxy: number;
  livelihood_proxy: number;
  water_soil_proxy: number;
  current_ndvi: number;
  degradation_proxy: number;
  elevation_m: number;
  annual_rain_mm: number;
  estimated_cost_million_eur: number;
  environmental_roi: number;
  restorable_land_pct: number;
  target_project_area_ha: number;
  area_ha: number;
  eligibility_status: string;
  recommendation: string;
  candidate_ok: number;
  carbon_tonnes_per_ha_2010: number;
  slope_deg: number;
  population_local_mean_5km: number;
  settlement_pressure_1km_pct: number;
  near_protected_area: number;
  plant_fit: number;
  carbon_credit_readiness?: "low" | "medium" | "high";
  cost_efficiency_score?: number;
  risk_score?: number;
  risk_flags?: string[];
  evidence?: string[];
  uncertainties?: string[];
  previous_priority_score?: number;
  previous_carbon_score?: number;
  previous_biodiversity_score?: number;
  previous_livelihood_score?: number;
  previous_tree_survival_score?: number;
  previous_cost_efficiency_score?: number;
  previous_risk_score?: number;
}

export interface CellFeature {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: CellProps;
}

const fc = raw as unknown as { type: "FeatureCollection"; features: CellFeature[] };

export const CELLS: CellFeature[] = fc.features;

export interface Weights {
  carbon: number;
  biodiversity: number;
  livelihood: number;
  water_soil: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  carbon: 0.25,
  biodiversity: 0.25,
  livelihood: 0.25,
  water_soil: 0.25,
};

export const PRESETS: Record<string, Weights> = {
  NGO: { carbon: 0.25, biodiversity: 0.3, livelihood: 0.25, water_soil: 0.2 },
  Investor: { carbon: 0.4, biodiversity: 0.2, livelihood: 0.15, water_soil: 0.25 },
  Government: { carbon: 0.2, biodiversity: 0.25, livelihood: 0.35, water_soil: 0.2 },
};

export function computeScore(p: CellProps, w: Weights): number {
  if (typeof p.backend_priority_score === "number") return p.backend_priority_score;
  return (
    (p.carbon_proxy * w.carbon +
      p.biodiversity_proxy * w.biodiversity +
      p.livelihood_proxy * w.livelihood +
      p.water_soil_proxy * w.water_soil) *
    (p.plant_fit / 100)
  );
}

export function scoreColor(s: number): string {
  if (s >= 55) return "#00A86B";
  if (s >= 45) return "#F59E0B";
  return "#EF4444";
}


export function centroid(coords: number[][][]): [number, number] {
  const ring = coords[0];
  let x = 0,
    y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

export function plantsForElevation(elev: number): string[] {
  if (elev > 2000)
    return [
      "Juniperus procera (African Pencil Cedar)",
      "Hagenia abyssinica (Kosso)",
      "Erica arborea (Tree Heath)",
    ];
  if (elev >= 1200)
    return [
      "Cordia africana (Large-leaved Cordia)",
      "Millettia ferruginea (Birbira)",
      "Croton macrostachyus (Broad-leaved Croton)",
    ];
  return [
    "Acacia tortilis (Umbrella Thorn)",
    "Balanites aegyptiaca (Desert Date)",
    "Faidherbia albida (Apple-ring Acacia)",
  ];
}

export function ndviLabel(v: number): string {
  if (v < 0.2) return "Low vegetation density";
  if (v < 0.4) return "Moderate vegetation";
  return "Dense vegetation";
}

export function degradationLabel(v: number): string {
  if (v < 0.15) return "Mild degradation";
  if (v < 0.3) return "Moderate degradation";
  return "Severe degradation";
}
