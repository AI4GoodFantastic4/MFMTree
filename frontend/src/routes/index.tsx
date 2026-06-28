import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopBar, type TabId } from "@/components/mfm/TopBar";
import { Sidebar } from "@/components/mfm/Sidebar";
import { MapView } from "@/components/mfm/MapView";
import { DetailPanel } from "@/components/mfm/DetailPanel";
import { RankingTab } from "@/components/mfm/RankingTab";
import { CompareTab } from "@/components/mfm/CompareTab";
import { useScoring } from "@/hooks/useScoring";
import { useTheme } from "@/hooks/useTheme";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MFMTree — Reforestation Priority Explorer" },
      {
        name: "description",
        content:
          "MFMTree helps NGO staff, investors, and governments identify the highest-priority reforestation cells across Ethiopia.",
      },
      { property: "og:title", content: "MFMTree — Reforestation Priority Explorer" },
      {
        property: "og:description",
        content:
          "Explore restoration scores across Ethiopia in 3D, rank candidate cells, and compare projects side-by-side.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap",
      },
    ],
  }),
  component: App,
});

function App() {
  const { weights, setWeight, setPreset, scored, cells, dataSource, usingDemoData, loading, error } = useScoring();
  const { theme, toggle: toggleTheme } = useTheme();

  const [tab, setTab] = useState<TabId>("map");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [flyToId, setFlyToId] = useState<number | null>(null);
  const [booting, setBooting] = useState(true);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [compareSelectFor, setCompareSelectFor] = useState<"A" | "B" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 800);
    return () => clearTimeout(t);
  }, []);

  const selectedFeature = useMemo(
    () => scored.find((c) => c.feature.properties.grid_id === selectedId)?.feature,
    [scored, selectedId],
  );

  const select = (id: number) => {
    setSelectedId(id);
    setFlyToId(id);
    setTab("map");
  };

  const handleMapSelect = (id: number) => {
    if (compareSelectFor) {
      if (compareSelectFor === "A") setCompareA(id);
      else setCompareB(id);
      setCompareSelectFor(null);
      setFlyToId(id);
      setTab("compare");
      return;
    }
    setSelectedId(id);
    setFlyToId(id);
  };

  const startCompareSelect = (slot: "A" | "B") => {
    setCompareSelectFor(slot);
    setTab("map");
  };

  const handleExport = () => {
    const cols = [
      "rank",
      "grid_id",
      "computed_score",
      "carbon_proxy",
      "biodiversity_proxy",
      "livelihood_proxy",
      "water_soil_proxy",
      "current_ndvi",
      "degradation_proxy",
      "elevation_m",
      "annual_rain_mm",
      "slope_deg",
      "area_ha",
      "target_project_area_ha",
      "restorable_land_pct",
      "estimated_cost_million_eur",
      "environmental_roi",
      "carbon_tonnes_per_ha_2010",
      "near_protected_area",
      "plant_fit",
      "eligibility_status",
      "recommendation",
    ];
    const lines = [cols.join(",")];
    scored.forEach((c, i) => {
      const p = c.feature.properties;
      const row = [
        i + 1,
        p.grid_id,
        c.score.toFixed(2),
        p.carbon_proxy,
        p.biodiversity_proxy,
        p.livelihood_proxy,
        p.water_soil_proxy,
        p.current_ndvi,
        p.degradation_proxy,
        p.elevation_m,
        p.annual_rain_mm,
        p.slope_deg,
        p.area_ha,
        p.target_project_area_ha,
        p.restorable_land_pct,
        p.estimated_cost_million_eur,
        p.environmental_roi,
        p.carbon_tonnes_per_ha_2010,
        p.near_protected_area,
        p.plant_fit,
        `"${p.eligibility_status.replace(/"/g, '""')}"`,
        `"${p.recommendation.replace(/"/g, '""')}"`,
      ];
      lines.push(row.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mfmtree_cells.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--mfm-bg)] text-[var(--mfm-text)]"
      style={{
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <TopBar tab={tab} onTab={setTab} onExport={handleExport} theme={theme} onToggleTheme={toggleTheme} />

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}
      >
        {tab === "map" && (
          <>
            <Sidebar
              weights={weights}
              setWeight={setWeight}
              setPreset={setPreset}
              topCells={scored.slice(0, 10)}
              onSelect={select}
              dataSource={dataSource}
              usingDemoData={usingDemoData}
              loading={loading}
              error={error}
            />
            <main
              className="relative min-w-0 flex-1 overflow-hidden"
              style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}
            >
              {compareSelectFor && (
                <div
                  className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-2 text-sm font-medium text-white"
                  style={{ background: "#0070FF" }}
                >
                  <span>Selecting for Cell {compareSelectFor} — click any cell on the map</span>
                  <button
                    onClick={() => {
                      setCompareSelectFor(null);
                      setTab("compare");
                    }}
                    className="rounded border border-white/40 px-2 py-0.5 text-xs hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <MapView
                cells={cells}
                weights={weights}
                selectedId={selectedId}
                onSelect={handleMapSelect}
                flyToId={flyToId}
                theme={theme}
                onToggleTheme={toggleTheme}
                onResetView={() => setSelectedId(null)}
                panelOpen={!!selectedFeature && !compareSelectFor}
                banner={usingDemoData ? "Data source: demo fallback" : `Data source: ${dataSource}`}
              />

              {selectedFeature && !compareSelectFor && (
                <DetailPanel
                  feature={selectedFeature}
                  weights={weights}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </main>
          </>
        )}
        {tab === "ranking" && (
          <main className="min-w-0 flex-1">
            <RankingTab scored={scored} weights={weights} onView={select} />
          </main>
        )}
        {tab === "compare" && (
          <main className="min-w-0 flex-1">
            <CompareTab
              scored={scored}
              weights={weights}
              aId={compareA}
              bId={compareB}
              onPickOnMap={startCompareSelect}
              onClear={(slot) => (slot === "A" ? setCompareA(null) : setCompareB(null))}
            />
          </main>
        )}
      </div>

      {(booting || loading) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--mfm-bg)]">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--mfm-border)] border-t-[#0070FF]" />
            <p className="text-sm text-[var(--mfm-text-2)]">{loading ? "Loading area data…" : "Loading MFMTree…"}</p>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-[60] hidden items-center justify-center bg-[var(--mfm-bg)] p-8 text-center max-[1023px]:flex">
        <p className="text-sm text-[var(--mfm-text)]">
          MFMTree is designed for desktop. Please use a screen at least 1024px wide.
        </p>
      </div>

    </div>
  );
}
