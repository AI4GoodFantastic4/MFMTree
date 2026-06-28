import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { computeScore, type CellFeature, type Weights } from "@/lib/cells";
import type { Theme } from "@/hooks/useTheme";

interface Props {
  cells: CellFeature[];
  weights: Weights;
  selectedId: number | null;
  onSelect: (id: number) => void;
  flyToId: number | null;
  theme: Theme;
  onToggleTheme?: () => void;
  onResetView?: () => void;
  compareB?: number | null;
  banner?: string;
  flyToPadRight?: number;
  panelOpen?: boolean;
}

const TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ||
  "pk.eyJ1IjoibWFya3N0b2xsZW53ZXJrIiwiYSI6ImNtcXdrNXZrejAwbWgycnIycmNuYXpuanIifQ.uHoDgmNARWUxQHFhbjUemQ";

const STYLE_FOR = (theme: Theme) =>
  theme === "light"
    ? "mapbox://styles/mapbox/light-v11"
    : "mapbox://styles/mapbox/satellite-streets-v12";

const INITIAL_BOUNDS: [mapboxgl.LngLatLike, mapboxgl.LngLatLike] = [
  [35.03, 3.41],
  [43.3, 14.4],
];

// Toggle column sits left of the Mapbox NavigationControl:
// 10px (Mapbox ctrl-top-right padding) + 32px (nav button width) + 8px (gap) = 50px right offset.
const NAV_CTRL_RIGHT_OFFSET = 50;
const PANEL_WIDTH = 380;

function buildGeoJSON(cells: CellFeature[], weights: Weights) {
  return {
    type: "FeatureCollection" as const,
    features: cells.map((f) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        id: f.properties.grid_id,
        areaId: f.properties.area_id,
        name: f.properties.name,
        computed_score: computeScore(f.properties, weights),
        eligibility_status: f.properties.eligibility_status,
      },
    })),
  };
}

export function MapView({ cells, weights, selectedId, onSelect, flyToId, theme, onToggleTheme, onResetView, compareB = null, banner, flyToPadRight = 400, panelOpen = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const loadedRef = useRef(false);
  // keep latest values for handlers defined inside init
  const cellsRef = useRef(cells);
  const weightsRef = useRef(weights);
  const modeRef = useRef<"2D" | "3D">("3D");
  const selectedRef = useRef<number | null>(null);
  const compareBRef = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);
  const [mode, setMode] = useState<"2D" | "3D">("3D");
  const [tokenBad, setTokenBad] = useState(false);

  cellsRef.current = cells;
  weightsRef.current = weights;
  modeRef.current = mode;
  selectedRef.current = selectedId;
  compareBRef.current = compareB;
  onSelectRef.current = onSelect;

  // shared layer setup, reused on init + theme switch
  function setupLayers(m: mapboxgl.Map) {
    const data = buildGeoJSON(cellsRef.current, weightsRef.current);
    if (m.getSource("cells")) {
      (m.getSource("cells") as mapboxgl.GeoJSONSource).setData(data as never);
      return;
    }
    m.addSource("cells", { type: "geojson", data: data as never });

    m.addLayer({
      id: "cells-extrusion",
      type: "fill-extrusion",
      source: "cells",
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["get", "computed_score"],
          40, "#EF4444",
          50, "#F59E0B",
          58, "#00A86B",
        ],
        "fill-extrusion-height": ["*", ["get", "computed_score"], 800],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.85,
      },
      layout: { visibility: modeRef.current === "3D" ? "visible" : "none" },
    });

    m.addLayer({
      id: "cells-fill",
      type: "fill",
      source: "cells",
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "computed_score"],
          40, "#EF4444",
          50, "#F59E0B",
          58, "#00A86B",
        ],
        "fill-opacity": 0.75,
      },
      layout: { visibility: modeRef.current === "2D" ? "visible" : "none" },
    });

    m.addLayer({
      id: "cells-border",
      type: "line",
      source: "cells",
      paint: { "line-color": "#ffffff", "line-width": 0.5, "line-opacity": 0.4 },
    });

    m.addLayer({
      id: "cells-selected",
      type: "line",
      source: "cells",
      paint: { "line-color": "#0070FF", "line-width": 3, "line-opacity": 1 },
      filter: ["==", ["get", "id"], selectedRef.current ?? -1],
    });

    m.addLayer({
      id: "cells-selected-b",
      type: "line",
      source: "cells",
      paint: { "line-color": "#7c3aed", "line-width": 3, "line-opacity": 1 },
      filter: ["==", ["get", "id"], compareBRef.current ?? -1],
    });

    const handleClick = (ev: { features?: Array<{ properties: Record<string, unknown> | null }> }) => {
      const f = ev.features?.[0];
      if (!f || !f.properties) return;
      const id = (f.properties as unknown as { id: number }).id;
      onSelectRef.current(id);
    };
    m.on("click", "cells-extrusion", handleClick as never);
    m.on("click", "cells-fill", handleClick as never);

    const enter = () => (m.getCanvas().style.cursor = "pointer");
    const leave = () => {
      m.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };
    m.on("mouseenter", "cells-extrusion", enter);
    m.on("mouseleave", "cells-extrusion", leave);
    m.on("mouseenter", "cells-fill", enter);
    m.on("mouseleave", "cells-fill", leave);

    const moveHandler = (ev: { lngLat: mapboxgl.LngLat; features?: Array<{ properties: Record<string, unknown> | null }> }) => {
      const f = ev.features?.[0];
      if (!f || !f.properties) return;
      const props = f.properties as unknown as { computed_score: number; eligibility_status: string; areaId?: string; name?: string };
      if (!popupRef.current) {
        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: "mfm-popup",
          offset: 12,
        });
      }
      popupRef.current
        .setLngLat(ev.lngLat)
        .setHTML(
          `<div style="font-family:Inter;font-size:12px;color:#f0f4ff;background:#0d1424;padding:6px 8px;border:1px solid #1e2d50;border-radius:6px"><div style="font-weight:600">${props.name || props.areaId || "Area"}</div><div>Score ${props.computed_score.toFixed(1)}</div><div style="color:#8b9cc8;font-size:11px">${props.eligibility_status}</div></div>`,
        )
        .addTo(m);
    };
    m.on("mousemove", "cells-extrusion", moveHandler as never);
    m.on("mousemove", "cells-fill", moveHandler as never);
  }

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (TOKEN.endsWith("PLACEHOLDER")) {
      setTokenBad(true);
      return;
    }
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_FOR(theme),
      bounds: INITIAL_BOUNDS,
      fitBoundsOptions: { padding: 60 },
      pitch: 40,
      bearing: -10,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    const ctrlTopRight = containerRef.current.querySelector(".mapboxgl-ctrl-top-right") as HTMLElement | null;
    if (ctrlTopRight) ctrlTopRight.style.transition = "right 300ms ease";

    map.on("error", (e) => {
      if (e?.error?.message?.toLowerCase().includes("unauthorized")) setTokenBad(true);
    });

    map.on("load", () => {
      loadedRef.current = true;
      setupLayers(map);
      requestAnimationFrame(() => map.resize());
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slide the Mapbox nav control left/right together with the React toggles when the detail panel opens.
  useEffect(() => {
    const el = containerRef.current?.querySelector(".mapboxgl-ctrl-top-right") as HTMLElement | null;
    if (!el) return;
    el.style.right = panelOpen ? `${PANEL_WIDTH}px` : "0";
  }, [panelOpen]);

  // theme → setStyle and re-add layers
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    m.setStyle(STYLE_FOR(theme));
    m.once("style.load", () => setupLayers(m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // update scores/materials without rebuilding or refetching geometry
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    const src = m.getSource("cells") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(buildGeoJSON(cells, weights) as never);
  }, [cells, weights]);

  // toggle 2D/3D
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    if (m.getLayer("cells-extrusion"))
      m.setLayoutProperty("cells-extrusion", "visibility", mode === "3D" ? "visible" : "none");
    if (m.getLayer("cells-fill"))
      m.setLayoutProperty("cells-fill", "visibility", mode === "2D" ? "visible" : "none");
    m.easeTo({ pitch: mode === "3D" ? 45 : 0, duration: 600 });
  }, [mode]);

  // selected highlight
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    if (m.getLayer("cells-selected"))
      m.setFilter("cells-selected", ["==", ["get", "id"], selectedId ?? -1]);
  }, [selectedId]);

  // compare B highlight
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    if (m.getLayer("cells-selected-b"))
      m.setFilter("cells-selected-b", ["==", ["get", "id"], compareB ?? -1]);
  }, [compareB]);

  // flyTo — pad right side so the detail panel doesn't cover the target
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current || flyToId == null) return;
    const f = cells.find((c) => c.properties.grid_id === flyToId);
    if (!f) return;
    const ring = f.geometry.coordinates[0];
    let x = 0,
      y = 0;
    for (const [lng, lat] of ring) {
      x += lng;
      y += lat;
    }
    m.flyTo({
      center: [x / ring.length, y / ring.length],
      zoom: 10,
      pitch: 45,
      bearing: -10,
      duration: 1200,
      padding: { top: 40, bottom: 40, left: 40, right: flyToPadRight },
    });
  }, [cells, flyToId, flyToPadRight]);

  const resetView = () => {
    mapRef.current?.fitBounds(INITIAL_BOUNDS, { padding: 60, pitch: 40, bearing: -10, duration: 1000 });
  };

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ height: "100%", minHeight: 0, position: "relative", overflow: "hidden" }}>
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {tokenBad && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--mfm-bg)]/95 p-8">
          <div className="max-w-md rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)] p-6 text-center">
            <h3 className="mb-2 text-lg font-semibold text-[var(--mfm-text)]">Mapbox token required</h3>
            <p className="text-sm text-[var(--mfm-text-2)]">
              Set <code className="text-[#0070FF]">VITE_MAPBOX_TOKEN</code> in a{" "}
              <code className="text-[#0070FF]">.env</code> file at the project root and reload to
              see the map.
            </p>
          </div>
        </div>
      )}

      {/* TOP RIGHT: toggle column sits left of Mapbox NavigationControl, both top-aligned */}
      <div
        className="absolute z-10 flex flex-col items-end gap-2"
        style={{
          top: 10,
          right: NAV_CTRL_RIGHT_OFFSET + (panelOpen ? PANEL_WIDTH : 0),
          transition: "right 300ms ease",
        }}
      >
        <div className="flex rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/90 p-0.5 backdrop-blur">
          {(["2D", "3D"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === m ? "bg-[#0070FF] text-white" : "text-[var(--mfm-text-2)] hover:text-[var(--mfm-text)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {onToggleTheme && (
          <div className="flex rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/90 p-0.5 backdrop-blur">
            {(["Light", "Satellite"] as const).map((label) => {
              const isActive = label === "Light" ? theme === "light" : theme !== "light";
              return (
                <button
                  key={label}
                  onClick={() => { if (!isActive) onToggleTheme(); }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive ? "bg-[#0070FF] text-white" : "text-[var(--mfm-text-2)] hover:text-[var(--mfm-text)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM LEFT: Reset View button + Restoration Score legend */}
      <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-2">
        <button
          onClick={() => { resetView(); onResetView?.(); }}
          className="rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/90 px-3 py-1 text-xs font-semibold text-[var(--mfm-text)] backdrop-blur transition-colors hover:bg-[var(--mfm-surface-2)]"
        >
          Reset View
        </button>
        <div className="rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/90 p-2 text-[10px] text-[var(--mfm-text)] backdrop-blur">
          <div className="mb-1 text-[var(--mfm-text-2)]">Restoration Score</div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#EF4444]" />
            <span>&lt; 45</span>
            <span className="ml-2 h-2 w-2 rounded-sm bg-[#F59E0B]" />
            <span>45–54</span>
            <span className="ml-2 h-2 w-2 rounded-sm bg-[#00A86B]" />
            <span>≥ 55</span>
          </div>
        </div>
      </div>

      {/* BOTTOM CENTER: data source banner (optional) + status bar, stacked */}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 flex flex-col items-center gap-2">
        {banner && (
          <div className="pointer-events-auto rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/95 px-3 py-1.5 text-xs font-medium text-[var(--mfm-text)] shadow backdrop-blur">
            {banner}
          </div>
        )}
        <div className="pointer-events-auto rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/80 px-3 py-1 text-[11px] text-[var(--mfm-text-2)] backdrop-blur">
          {cells.length} areas loaded · Weights C{Math.round(weights.carbon * 100)}% B
          {Math.round(weights.biodiversity * 100)}% L{Math.round(weights.livelihood * 100)}% W
          {Math.round(weights.water_soil * 100)}%
        </div>
      </div>
    </div>
  );
}
