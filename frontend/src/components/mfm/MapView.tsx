import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Home } from "lucide-react";
import {
  computeScore,
  getCellDisplayName,
  getCellLocationLabel,
  getCellTechnicalName,
  type CellFeature,
  type Weights,
} from "@/lib/cells";
import type { Theme } from "@/hooks/useTheme";

interface Props {
  cells: CellFeature[];
  weights: Weights;
  selectedId: number | null;
  onSelect: (id: number) => void;
  flyToId: number | null;
  theme: Theme;
  compareB?: number | null;
  banner?: string;
  onCancel?: () => void;
  flyToPadRight?: number;
  isPanelOpen?: boolean;
  selectionBannerVisible?: boolean;
}

const TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ||
  "pk.eyJ1IjoibWFya3N0b2xsZW53ZXJrIiwiYSI6ImNtcXdrNXZrejAwbWgycnIycmNuYXpuanIifQ.uHoDgmNARWUxQHFhbjUemQ";

type StyleKey = "light" | "satellite";
const STYLE_URL: Record<StyleKey, string> = {
  light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};
const STYLE_FOR = (theme: Theme): StyleKey => (theme === "light" ? "light" : "satellite");
const INITIAL_BOUNDS: mapboxgl.LngLatBoundsLike = [
  [35.03, 3.41],
  [43.3, 14.4],
];
const CAMERA_3D = { pitch: 45, bearing: -10 };
const CAMERA_2D = { pitch: 0, bearing: 0 };
const TERRAIN_SOURCE_ID = "mapbox-dem";

function buildGeoJSON(cells: CellFeature[], weights: Weights) {
  return {
    type: "FeatureCollection" as const,
    features: cells.map((f) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        id: f.properties.grid_id,
        areaId: f.properties.area_id,
        name: getCellDisplayName(f.properties),
        technicalName: getCellTechnicalName(f.properties),
        locationLabel: getCellLocationLabel(f.properties),
        computed_score: computeScore(f.properties, weights),
        eligibility_status: f.properties.eligibility_status,
      },
    })),
  };
}

export function MapView({
  cells,
  weights,
  selectedId,
  onSelect,
  flyToId,
  theme,
  compareB = null,
  banner,
  onCancel,
  flyToPadRight = 400,
  isPanelOpen = false,
  selectionBannerVisible = false,
}: Props) {
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
  const flyToIdRef = useRef(flyToId);
  const flyToPadRightRef = useRef(flyToPadRight);
  const resetCameraTimeoutRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"2D" | "3D">("3D");
  const [styleOverride, setStyleOverride] = useState<StyleKey | null>(null);
  const [tokenBad, setTokenBad] = useState(false);
  const activeStyle = styleOverride ?? STYLE_FOR(theme);

  cellsRef.current = cells;
  weightsRef.current = weights;
  modeRef.current = mode;
  selectedRef.current = selectedId;
  compareBRef.current = compareB;
  onSelectRef.current = onSelect;
  flyToIdRef.current = flyToId;
  flyToPadRightRef.current = flyToPadRight;

  const flyToCell = useCallback((id: number) => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    const f = cellsRef.current.find((cell) => cell.properties.grid_id === id);
    if (!f) return;
    const ring = f.geometry.coordinates[0];
    let x = 0;
    let y = 0;
    for (const [lng, lat] of ring) {
      x += lng;
      y += lat;
    }
    m.flyTo({
      center: [x / ring.length, y / ring.length],
      zoom: 10,
      ...CAMERA_3D,
      duration: 1200,
      padding: { top: 40, bottom: 40, left: 40, right: flyToPadRightRef.current },
    });
  }, []);

  const applyCameraMode = useCallback((m: mapboxgl.Map, nextMode: "2D" | "3D", duration = 0) => {
    const camera = nextMode === "3D" ? CAMERA_3D : CAMERA_2D;
    m.easeTo({ ...camera, duration });
  }, []);

  const applyTerrainMode = useCallback((m: mapboxgl.Map, nextMode: "2D" | "3D") => {
    if (nextMode === "3D") {
      if (!m.getSource(TERRAIN_SOURCE_ID)) {
        m.addSource(TERRAIN_SOURCE_ID, {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      m.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.5 });
      m.setFog({ color: "rgba(255,255,255,0.85)", "horizon-blend": 0.08 });
    } else {
      m.setTerrain(null);
      m.setFog(null);
    }
  }, []);

  const enforceCameraMode = useCallback(
    (m: mapboxgl.Map, nextMode: "2D" | "3D") => {
      const camera = nextMode === "3D" ? CAMERA_3D : CAMERA_2D;
      applyTerrainMode(m, nextMode);
      m.setPitch(camera.pitch);
      m.setBearing(camera.bearing);
    },
    [applyTerrainMode],
  );

  const resetView = useCallback(
    (duration = 1000) => {
      const m = mapRef.current;
      if (!m) return;
      const camera = modeRef.current === "3D" ? CAMERA_3D : CAMERA_2D;
      m.fitBounds(INITIAL_BOUNDS, { padding: 60, duration, ...camera });
      if (resetCameraTimeoutRef.current) window.clearTimeout(resetCameraTimeoutRef.current);
      resetCameraTimeoutRef.current = window.setTimeout(
        () => enforceCameraMode(m, modeRef.current),
        duration + 50,
      );
    },
    [enforceCameraMode],
  );

  const activateMode = useCallback(
    (nextMode: "2D" | "3D") => {
      modeRef.current = nextMode;
      setMode(nextMode);
      const m = mapRef.current;
      if (!m || !loadedRef.current) return;
      if (m.getLayer("cells-extrusion")) {
        m.setLayoutProperty(
          "cells-extrusion",
          "visibility",
          nextMode === "3D" ? "visible" : "none",
        );
      }
      if (m.getLayer("cells-fill")) {
        m.setLayoutProperty("cells-fill", "visibility", nextMode === "2D" ? "visible" : "none");
      }
      applyTerrainMode(m, nextMode);
      applyCameraMode(m, nextMode, 600);
    },
    [applyCameraMode, applyTerrainMode],
  );

  // shared layer setup, reused on init + theme switch
  function setupLayers(m: mapboxgl.Map) {
    applyTerrainMode(m, modeRef.current);
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
          40,
          "#EF4444",
          50,
          "#F59E0B",
          58,
          "#00A86B",
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
          40,
          "#EF4444",
          50,
          "#F59E0B",
          58,
          "#00A86B",
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

    const handleClick = (ev: {
      features?: Array<{ properties: Record<string, unknown> | null }>;
    }) => {
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

    const moveHandler = (ev: {
      lngLat: mapboxgl.LngLat;
      features?: Array<{ properties: Record<string, unknown> | null }>;
    }) => {
      const f = ev.features?.[0];
      if (!f || !f.properties) return;
      const props = f.properties as unknown as {
        computed_score: number;
        eligibility_status: string;
        areaId?: string;
        name?: string;
        technicalName?: string;
        locationLabel?: string;
      };
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
          `<div style="font-family:Inter;font-size:12px;color:#f0f4ff;background:#0d1424;padding:6px 8px;border:1px solid #1e2d50;border-radius:6px"><div style="font-weight:600">${props.name || props.areaId || "Area"}</div><div style="color:#8b9cc8;font-size:11px">${props.technicalName || props.locationLabel || ""}</div><div>Score ${props.computed_score.toFixed(1)}</div><div style="color:#8b9cc8;font-size:11px">${props.eligibility_status}</div></div>`,
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
      style: STYLE_URL[activeStyle],
      center: [39.165, 8.905],
      zoom: 5.7,
      ...CAMERA_3D,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("error", (e) => {
      if (e?.error?.message?.toLowerCase().includes("unauthorized")) setTokenBad(true);
    });

    map.on("load", () => {
      loadedRef.current = true;
      setupLayers(map);
      requestAnimationFrame(() => {
        map.resize();
        if (flyToIdRef.current != null) {
          flyToCell(flyToIdRef.current);
        } else {
          resetView(0);
        }
        enforceCameraMode(map, modeRef.current);
      });
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      if (resetCameraTimeoutRef.current) window.clearTimeout(resetCameraTimeoutRef.current);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme/style → setStyle and re-add layers
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    m.setStyle(STYLE_URL[activeStyle]);
    m.once("style.load", () => {
      setupLayers(m);
      enforceCameraMode(m, modeRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStyle]);

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
    applyTerrainMode(m, mode);
    applyCameraMode(m, mode, 600);
  }, [mode, applyCameraMode, applyTerrainMode]);

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
    if (flyToId == null) return;
    flyToCell(flyToId);
  }, [flyToId, flyToPadRight, flyToCell]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ height: "100%", minHeight: 0, position: "relative", overflow: "hidden" }}
    >
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {tokenBad && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--mfm-bg)]/95 p-8">
          <div className="max-w-md rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)] p-6 text-center">
            <h3 className="mb-2 text-lg font-semibold text-[var(--mfm-text)]">
              Mapbox token required
            </h3>
            <p className="text-sm text-[var(--mfm-text-2)]">
              Set <code className="text-[#0070FF]">VITE_MAPBOX_TOKEN</code> in a{" "}
              <code className="text-[#0070FF]">.env</code> file at the project root and reload to
              see the map.
            </p>
          </div>
        </div>
      )}
      {banner && (
        <div
          className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between px-4 text-xs font-medium text-white shadow"
          style={{ background: "#0070FF", height: selectionBannerVisible ? "48px" : "34px" }}
        >
          <div className="w-16" />
          <span className="flex-1 text-center">{banner}</span>
          {onCancel ? (
            <button
              onClick={onCancel}
              className="w-16 rounded border border-white/40 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Cancel
            </button>
          ) : (
            <div className="w-16" />
          )}
        </div>
      )}
      <div
        className="absolute z-40 flex flex-col items-end gap-1.5 transition-all"
        style={{
          top: selectionBannerVisible ? "64px" : "16px",
          right: isPanelOpen ? "396px" : "16px",
        }}
      >
        <div className="flex rounded-md bg-white/95 p-0.5 shadow">
          {(["2D", "3D"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => activateMode(m)}
                className="rounded px-2 py-1 text-[11px] font-semibold transition-colors"
                style={{
                  background: active ? "#0070FF" : "transparent",
                  color: active ? "#fff" : "#374151",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
        <div className="flex rounded-md bg-white/95 p-0.5 shadow">
          {(["light", "satellite"] as const).map((styleKey) => {
            const active = activeStyle === styleKey;
            return (
              <button
                key={styleKey}
                onClick={() => setStyleOverride(styleKey)}
                className="rounded px-2 py-1 text-[11px] font-semibold capitalize transition-colors"
                style={{
                  background: active ? "#0070FF" : "transparent",
                  color: active ? "#fff" : "#374151",
                }}
              >
                {styleKey}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 flex justify-center">
        <div className="pointer-events-auto rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface)]/80 px-3 py-1 text-[11px] text-[var(--mfm-text-2)] backdrop-blur">
          {cells.length} areas loaded · Weights C{Math.round(weights.carbon * 100)}% B
          {Math.round(weights.biodiversity * 100)}% L{Math.round(weights.livelihood * 100)}% W
          {Math.round(weights.water_soil * 100)}%
        </div>
      </div>
      <div className="absolute bottom-12 left-4 z-30 flex flex-col gap-1.5">
        <button
          onClick={() => resetView()}
          className="flex items-center justify-center gap-1 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#374151] shadow transition-colors hover:bg-white"
        >
          <Home size={12} strokeWidth={1.5} />
          <span>Reset view</span>
        </button>
        <div className="rounded-md border border-[var(--mfm-border)] bg-[#0d1424]/90 p-2 text-[10px] text-white/90 backdrop-blur">
          <div className="mb-1 text-white/70">Restoration Score</div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#EF4444]" />
            <span>&lt; 45</span>
            <span className="ml-2 h-2 w-2 rounded-sm bg-[#F59E0B]" />
            <span>45-54</span>
            <span className="ml-2 h-2 w-2 rounded-sm bg-[#00A86B]" />
            <span>&gt;= 55</span>
          </div>
        </div>
      </div>
    </div>
  );
}
