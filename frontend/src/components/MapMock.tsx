import type { Area, GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry } from "../api/client";

type Props = {
  areas: Area[];
  geojson?: GeoJsonFeatureCollection;
  dataSource: string;
  selectedAreaId: string;
  onSelect: (areaId: string) => void;
};

const positions = [
  { x: 39, y: 62, shape: "polygon-a" },
  { x: 34, y: 50, shape: "polygon-b" },
  { x: 52, y: 72, shape: "polygon-c" },
  { x: 57, y: 42, shape: "polygon-d" },
  { x: 45, y: 57, shape: "polygon-e" },
];

export function MapMock({ areas, geojson, dataSource, selectedAreaId, onSelect }: Props) {
  const scoreByArea = new Map(areas.map((area) => [area.areaId, area]));
  const featurePolygons = geojson ? buildFeaturePolygons(geojson.features) : [];
  const isGeoJson = featurePolygons.length > 0;

  return (
    <section className="mapPanel" aria-label="GIS map of candidate areas">
      <div className="mapHeader">
        <div>
          <div className="eyebrow">Ethiopia Candidate Screen</div>
          <h2>Reforestation opportunity map</h2>
        </div>
        <div className="mapTools">
          <div className={`dataBadge ${isGeoJson ? "dataBadgeLive" : "dataBadgeMock"}`}>
            Data source: {isGeoJson ? sourceLabel(dataSource) : "Mock fallback"}
          </div>
          <div className="legend">
            <span className="legendHigh" /> High
            <span className="legendMed" /> Medium
            <span className="legendLow" /> Review
          </div>
        </div>
      </div>
      <div className="mapCanvas">
        <div className="ethiopiaSilhouette" />
        <div className="terrainLine terrainLineA" />
        <div className="terrainLine terrainLineB" />
        <div className="terrainLine terrainLineC" />
        {isGeoJson ? (
          <svg className="geojsonMapLayer" viewBox="0 0 100 100" role="img" aria-label="GeoJSON candidate polygons">
            {featurePolygons.map((feature) => {
              const area = scoreByArea.get(feature.areaId);
              const score = area?.priorityScore ?? 0;
              return (
                <g
                  key={feature.areaId}
                  className={`geoArea ${priorityClass(score)} ${selectedAreaId === feature.areaId ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(feature.areaId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onSelect(feature.areaId);
                  }}
                >
                  <polygon points={feature.points} />
                  <text x={feature.label.x} y={feature.label.y}>
                    {feature.areaId} {score}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          areas.map((area, index) => {
            const pos = positions[index % positions.length];
            return (
              <button
                key={area.areaId}
                className={`areaMarker ${pos.shape} ${priorityClass(area.priorityScore)} ${selectedAreaId === area.areaId ? "selected" : ""}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={() => onSelect(area.areaId)}
                type="button"
              >
                <span>{area.areaId}</span>
                <strong>{area.priorityScore}</strong>
              </button>
            );
          })
        )}
        <div className="mapTodo">
          {isGeoJson
            ? "Rendering GeoJSON polygons. TODO: replace SVG projection with CesiumJS or MapLibre for production."
            : "Mock map fallback. Upload geometry/areas.geojson to render real polygons."}
        </div>
      </div>
    </section>
  );
}

function priorityClass(score: number) {
  if (score >= 80) return "priorityHigh";
  if (score >= 70) return "priorityMedium";
  return "priorityReview";
}

function sourceLabel(source: string) {
  if (source === "s3") return "API/S3 GeoJSON";
  if (source === "local") return "API/local GeoJSON";
  return "API GeoJSON";
}

function buildFeaturePolygons(features: GeoJsonFeature[]) {
  const rings = features
    .map((feature) => ({ feature, ring: firstOuterRing(feature.geometry) }))
    .filter((item): item is { feature: GeoJsonFeature; ring: [number, number][] } => item.ring.length >= 4);
  const allPoints = rings.flatMap((item) => item.ring);
  if (!allPoints.length) return [];

  const lons = allPoints.map((point) => point[0]);
  const lats = allPoints.map((point) => point[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lonRange = maxLon - minLon || 1;
  const latRange = maxLat - minLat || 1;
  const padding = 12;

  return rings.map(({ feature, ring }) => {
    const projected = ring.map(([lon, lat]) => ({
      x: padding + ((lon - minLon) / lonRange) * (100 - padding * 2),
      y: padding + ((maxLat - lat) / latRange) * (100 - padding * 2),
    }));
    const label = projected.reduce(
      (acc, point) => ({ x: acc.x + point.x / projected.length, y: acc.y + point.y / projected.length }),
      { x: 0, y: 0 },
    );
    return {
      areaId: feature.properties.areaId,
      points: projected.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
      label,
    };
  });
}

function firstOuterRing(geometry: GeoJsonGeometry): [number, number][] {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return normalizeRing(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return normalizeRing(geometry.coordinates[0]?.[0]);
  }
  return [];
}

function normalizeRing(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is [number, number] =>
      Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number",
  );
}
