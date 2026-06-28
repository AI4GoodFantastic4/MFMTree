import { ChevronLeft, ChevronRight, Sliders, ListOrdered } from "lucide-react";
import { useState } from "react";
import { scoreColor, type Weights } from "@/lib/cells";

interface ScoredCell {
  feature: { properties: { grid_id: number; eligibility_status: string } };
  score: number;
}

interface Props {
  weights: Weights;
  setWeight: (k: keyof Weights, v: number) => void;
  setPreset: (w: Weights) => void;
  topCells: ScoredCell[];
  onSelect: (id: number) => void;
  dataSource?: string;
  usingDemoData?: boolean;
  loading?: boolean;
  error?: string | null;
}

const LABELS: { key: keyof Weights; label: string }[] = [
  { key: "carbon", label: "Carbon Capture" },
  { key: "biodiversity", label: "Biodiversity" },
  { key: "livelihood", label: "Livelihood" },
  { key: "water_soil", label: "Water & Soil" },
];

export function Sidebar({ weights, setWeight, topCells, onSelect, dataSource, usingDemoData, loading, error }: Props) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <aside
        className="flex w-10 shrink-0 flex-col items-center gap-3 overflow-y-auto border-r border-[var(--mfm-border)] bg-[var(--mfm-surface)] py-3"
        style={{ width: "40px", flexShrink: 0, height: "100%", overflowY: "auto" }}
      >
        <button onClick={() => setOpen(true)} className="text-[var(--mfm-text-2)] hover:text-[var(--mfm-text)]">
          <ChevronRight className="h-5 w-5" />
        </button>
        <Sliders className="h-5 w-5 text-[var(--mfm-text-2)]" />
        <ListOrdered className="h-5 w-5 text-[var(--mfm-text-2)]" />
      </aside>
    );
  }

  const total = Math.round(
    (weights.carbon + weights.biodiversity + weights.livelihood + weights.water_soil) * 100,
  );

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-[var(--mfm-border)] bg-[var(--mfm-surface)]"
      style={{ width: "280px", flexShrink: 0, height: "100%", overflowY: "auto" }}
    >
      <div className="flex items-center justify-between border-b border-[var(--mfm-border)] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
          Controls
        </span>
        <button onClick={() => setOpen(false)} className="text-[var(--mfm-text-2)] hover:text-[var(--mfm-text)]">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <section className="border-b border-[var(--mfm-border)] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            Data
          </h3>
          <div
            className="rounded-md border px-2 py-1.5 text-xs"
            style={{
              borderColor: usingDemoData ? "#F59E0B" : "#00A86B",
              color: usingDemoData ? "#F59E0B" : "#00A86B",
            }}
          >
            {loading ? "Loading API data..." : usingDemoData ? "Using demo fallback" : `API/S3: ${dataSource || "loaded"}`}
          </div>
          {error && <p className="mt-2 text-[10px] leading-relaxed text-[#F59E0B]">{error}</p>}
        </section>

        <section className="border-b border-[var(--mfm-border)] p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            Scoring Weights
          </h3>
          <div className="space-y-3">
            {LABELS.map(({ key, label }) => {
              const pct = Math.round(weights[key] * 100);
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--mfm-text)]">{label}</span>
                    <span className="font-mono text-[#00A86B]">{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={weights[key]}
                    onChange={(e) => setWeight(key, parseFloat(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--mfm-border)]"
                    style={{ accentColor: "#00A86B" }}
                  />
                </div>
              );
            })}
          </div>
          {total !== 100 && (
            <p className="mt-2 text-[10px] text-[#F59E0B]">Weights total: {total}%</p>
          )}
        </section>

        <section className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--mfm-text-2)]">
            Top 10 Cells
          </h3>
          <div className="space-y-1">
            {topCells.slice(0, 10).map((c, i) => {
              const s = c.score;
              const id = c.feature.properties.grid_id;
              return (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className="flex w-full items-center gap-2 rounded-md border border-transparent bg-[var(--mfm-surface-2)] px-2 py-1.5 text-left transition-colors hover:border-[#0070FF]"
                >
                  <span className="w-5 text-xs font-mono text-[var(--mfm-text-2)]">{i + 1}</span>
                  <span className="flex-1 truncate font-mono text-[11px] text-[var(--mfm-text)]">
                    #{id.toString().slice(-6)}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: scoreColor(s) }}
                  >
                    {s.toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
