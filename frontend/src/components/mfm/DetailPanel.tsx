import React, { useEffect, useState } from "react";
import { X, Leaf, TrendingDown, CloudRain, Mountain, Sprout } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell as RCell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  type CellFeature,
  computeScore,
  degradationLabel,
  ndviLabel,
  plantsForElevation,
  scoreColor,
  type Weights,
} from "@/lib/cells";
import { explainArea, getCostEstimate, type CostEstimate } from "@/lib/api";

interface Props {
  feature: CellFeature;
  weights: Weights;
  onClose: () => void;
}

export function DetailPanel({ feature, weights, onClose }: Props) {
  const p = feature.properties;
  const score = computeScore(p, weights);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiText, setAiText] = useState("");
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [apiNote, setApiNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAiLoading(true);
    setAiText("");
    setCostEstimate(null);
    setApiNote(null);

    const fallbackText = `This area shows ${score >= 55 ? "strong" : score >= 45 ? "moderate" : "limited"} restoration potential with a score of ${score.toFixed(1)}. Carbon potential, ecological suitability, access, and risk still require onsite expert validation before investment.`;

    async function loadAreaOutputs() {
      if (!p.area_id) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (!cancelled) {
          setAiText(fallbackText);
          setApiNote("Local demo cell: backend areaId unavailable.");
          setAiLoading(false);
        }
        return;
      }

      const [explanationResult, costResult] = await Promise.allSettled([
        explainArea(p.area_id),
        getCostEstimate(p.area_id),
      ]);

      if (cancelled) return;
      if (explanationResult.status === "fulfilled") setAiText(explanationResult.value);
      else {
        setAiText(fallbackText);
        setApiNote("AI explanation endpoint unavailable; using local summary.");
      }
      if (costResult.status === "fulfilled") setCostEstimate(costResult.value);
      setAiLoading(false);
    }

    loadAreaOutputs();
    return () => {
      cancelled = true;
    };
  }, [p.area_id, p.grid_id]);

  const barData = [
    { name: "Carbon", v: p.carbon_proxy },
    { name: "Biodiv.", v: p.biodiversity_proxy },
    { name: "Livelihood", v: p.livelihood_proxy },
    { name: "Water/Soil", v: p.water_soil_proxy },
  ];

  const plants = plantsForElevation(p.elevation_m);

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-[380px] flex-col border-l border-[var(--mfm-border)] bg-[var(--mfm-surface)] shadow-2xl">
      <div className="flex items-start justify-between border-b border-[var(--mfm-border)] p-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-[var(--mfm-text-2)]">{p.area_id || `#${p.grid_id}`}</div>
          {p.name && <div className="mt-1 truncate text-sm font-semibold text-[var(--mfm-text)]">{p.name}</div>}
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="text-3xl font-bold"
              style={{ color: scoreColor(score) }}
            >
              {score.toFixed(1)}
            </span>
            <span className="text-xs text-[var(--mfm-text-2)]">Restoration Score</span>
          </div>
          <div className="mt-1 text-xs text-[var(--mfm-text)]">{p.priority_category}</div>
          <span
            className="mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px]"
            style={{ borderColor: scoreColor(score), color: scoreColor(score) }}
          >
            {p.eligibility_status}
          </span>
        </div>
        <button
          onClick={onClose}
          className="ml-2 rounded-md p-1 text-[var(--mfm-text-2)] hover:bg-[var(--mfm-surface-2)] hover:text-[var(--mfm-text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-[var(--mfm-border)] p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            Score Breakdown
          </h4>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={70}
                  tick={{ fill: "var(--mfm-text-2)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--mfm-surface-2)" }}
                  contentStyle={{
                    background: "var(--mfm-bg)",
                    border: "1px solid var(--mfm-border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                  {barData.map((d, i) => (
                    <RCell key={i} fill={scoreColor(d.v)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 border-b border-[var(--mfm-border)] p-4">
          <Metric icon={Leaf} label="NDVI" value={p.current_ndvi.toFixed(2)} sub={ndviLabel(p.current_ndvi)} />
          <Metric
            icon={TrendingDown}
            label="Degradation"
            value={`${Math.round(p.degradation_proxy * 100)}%`}
            sub={degradationLabel(p.degradation_proxy)}
          />
          <Metric icon={CloudRain} label="Rainfall" value={`${Math.round(p.annual_rain_mm)} mm`} sub="per year" />
          <Metric icon={Mountain} label="Elevation" value={`${Math.round(p.elevation_m)} m`} sub={`Slope ${p.slope_deg.toFixed(1)}°`} />
        </section>

        <section className="border-b border-[var(--mfm-border)] p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            Project Data
          </h4>
          <dl className="space-y-1.5 text-xs">
            <Row k="Restorable area" v={`${p.restorable_land_pct.toFixed(1)}% (${Math.round(p.target_project_area_ha).toLocaleString()} ha)`} />
            <Row k="Carbon density" v={`${p.carbon_tonnes_per_ha_2010.toFixed(1)} t/ha`} />
            <Row k="Estimated cost" v={costEstimate ? formatMoney(costEstimate.estimatedTotalCost, costEstimate.currency) : `€${p.estimated_cost_million_eur.toFixed(2)}M`} />
            {costEstimate && <Row k="Cost per ha" v={`${formatMoney(costEstimate.estimatedCostPerHa, costEstimate.currency)}/ha`} />}
            {costEstimate && <Row k="Cost per tCO2e" v={costEstimate.estimatedCostPerTCO2e == null ? "n/a" : `${formatMoney(costEstimate.estimatedCostPerTCO2e, costEstimate.currency)}/tCO2e`} />}
            {costEstimate && <Row k="Cost confidence" v={costEstimate.costConfidence} />}
            <Row k="Environmental ROI" v={`${p.environmental_roi.toFixed(1)}x`} />
            <Row k="Near protected area" v={p.near_protected_area > 0.5 ? "Yes" : "No"} />
            <Row k="Plant suitability" v={`${p.plant_fit.toFixed(0)}%`} />
            <Row k="Carbon readiness" v={p.carbon_credit_readiness || "Requires review"} />
          </dl>
        </section>

        {(costEstimate?.costDrivers?.length || p.risk_flags?.length || p.evidence?.length || p.uncertainties?.length) && (
          <section className="border-b border-[var(--mfm-border)] p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
              Evidence & Risk
            </h4>
            <BulletList title="Cost drivers" items={costEstimate?.costDrivers || []} />
            <BulletList title="Risk flags" items={p.risk_flags || []} />
            <BulletList title="Evidence" items={p.evidence || []} />
            <BulletList title="Uncertainties" items={p.uncertainties || costEstimate?.costWarnings || []} />
          </section>
        )}

        <section className="border-b border-[var(--mfm-border)] p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            Recommended Species
          </h4>
          <ul className="space-y-1 text-xs text-[var(--mfm-text)]">
            {plants.map((s) => (
              <li key={s} className="flex gap-2">
                <Sprout className="h-3 w-3 shrink-0 mt-0.5 text-[var(--mfm-text-2)]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            AI Analysis
          </h4>
          {aiLoading ? (
            <div className="space-y-2">
              <div className="h-3 animate-pulse rounded bg-[var(--mfm-border)]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--mfm-border)]" />
              <div className="h-3 w-4/6 animate-pulse rounded bg-[var(--mfm-border)]" />
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-[var(--mfm-text)]">
              {aiText}
            </p>
          )}
          {apiNote && <p className="mt-2 text-[10px] text-[#F59E0B]">{apiNote}</p>}
          <p className="mt-3 text-[10px] italic text-[var(--mfm-text-2)]">
            AI analysis powered by Amazon Bedrock. Final decisions require local expert validation.
          </p>
        </section>
      </div>
    </aside>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface-2)] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--mfm-text-2)]">
        <Icon className="h-3 w-3" />
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-0.5 text-base font-semibold text-[var(--mfm-text)]">{value}</div>
      <div className="text-[10px] text-[var(--mfm-text-2)]">{sub}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--mfm-text-2)]">{k}</dt>
      <dd className="text-right font-mono text-[var(--mfm-text)]">{v}</dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">{title}</div>
      <ul className="space-y-1 text-xs text-[var(--mfm-text)]">
        {items.slice(0, 4).map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-[var(--mfm-text-2)]">-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatMoney(value: number | null | undefined, currency: string) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}
