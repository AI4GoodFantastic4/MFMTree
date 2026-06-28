import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  computeScore,
  getCellDisplayName,
  getCellTechnicalName,
  scoreColor,
  type CellFeature,
  type Weights,
} from "@/lib/cells";

interface Props {
  scored: { feature: CellFeature; score: number }[];
  weights: Weights;
  onView: (id: number) => void;
}

type SortKey =
  | "score"
  | "grid_id"
  | "carbon_proxy"
  | "biodiversity_proxy"
  | "livelihood_proxy"
  | "water_soil_proxy"
  | "area_ha"
  | "estimated_cost_million_eur"
  | "environmental_roi";

export function RankingTab({ scored, weights, onView }: Props) {
  const [region] = useState("all"); // TODO: add region filter when real data available
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const r = [...scored];
    r.sort((a, b) => {
      const va =
        sortKey === "score"
          ? a.score
          : (a.feature.properties as unknown as Record<string, number>)[sortKey];
      const vb =
        sortKey === "score"
          ? b.score
          : (b.feature.properties as unknown as Record<string, number>)[sortKey];

      return dir === "asc" ? va - vb : vb - va;
    });
    return r;
  }, [scored, sortKey, dir]);

  const toggle = (k: SortKey) => {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir("desc");
    }
  };

  const headerCell = (k: SortKey, label: string, align: "left" | "right" = "right") => (
    <th
      onClick={() => toggle(k)}
      className={`cursor-pointer select-none px-3 py-2 text-xs font-semibold text-[var(--mfm-text-2)] hover:text-[var(--mfm-text)] ${align === "right" ? "text-right" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--mfm-bg)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--mfm-text)]">Candidate Ranking</h2>
        <select
          value={region}
          disabled
          className="rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface)] px-3 py-1.5 text-sm text-[var(--mfm-text)] disabled:opacity-70"
        >
          <option value="all">All candidates ({scored.length})</option>
        </select>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)]">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10 bg-[var(--mfm-surface-2)]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--mfm-text-2)]">
                #
              </th>
              {headerCell("grid_id", "Candidate area", "left")}
              {headerCell("score", "Score")}
              {headerCell("carbon_proxy", "Carbon")}
              {headerCell("biodiversity_proxy", "Biodiv.")}
              {headerCell("livelihood_proxy", "Livelihood")}
              {headerCell("water_soil_proxy", "Water/Soil")}
              {headerCell("area_ha", "Area (ha)")}
              {headerCell("estimated_cost_million_eur", "Cost (M€)")}
              {headerCell("environmental_roi", "ROI")}
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--mfm-text-2)]">
                Eligibility
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = r.feature.properties;
              const s = r.score;
              return (
                <tr
                  key={p.grid_id}
                  className="border-t border-[var(--mfm-border)] hover:bg-[var(--mfm-surface-2)]"
                >
                  <td className="px-3 py-2 text-xs text-[var(--mfm-text-2)]">{i + 1}</td>
                  <td className="max-w-[260px] px-3 py-2 text-xs">
                    <div className="truncate font-semibold text-[var(--mfm-text)]">
                      {getCellDisplayName(p)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-[var(--mfm-text-2)]">
                      {getCellTechnicalName(p)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: scoreColor(s) }}
                    >
                      {s.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {p.carbon_proxy.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {p.biodiversity_proxy.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {p.livelihood_proxy.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {p.water_soil_proxy.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {Math.round(p.area_ha).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {p.estimated_cost_million_eur.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--mfm-text)]">
                    {p.environmental_roi.toFixed(1)}x
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--mfm-text-2)]">
                    {p.eligibility_status}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onView(p.grid_id)}
                      className="rounded-md border border-[#0070FF] px-2 py-1 text-[11px] text-[#0070FF] hover:bg-[#0070FF] hover:text-white"
                    >
                      View on Map
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[var(--mfm-text-2)]">
        Showing {rows.length} candidates · Sorted by {sortKey} {dir}. Scores reflect current weights
        (C
        {Math.round(weights.carbon * 100)}% B{Math.round(weights.biodiversity * 100)}% L
        {Math.round(weights.livelihood * 100)}% W{Math.round(weights.water_soil * 100)}%).{" "}
        <span className="opacity-0">{computeScore.name}</span>
      </p>
    </div>
  );
}
