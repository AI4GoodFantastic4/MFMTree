import type { Area } from "../api/client";

type Props = {
  areas: Area[];
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

export function MapMock({ areas, selectedAreaId, onSelect }: Props) {
  return (
    <section className="mapPanel" aria-label="Mock GIS map of candidate areas">
      <div className="mapHeader">
        <div>
          <div className="eyebrow">Ethiopia Candidate Screen</div>
          <h2>Reforestation opportunity map</h2>
        </div>
        <div className="legend">
          <span className="legendHigh" /> High
          <span className="legendMed" /> Medium
          <span className="legendLow" /> Review
        </div>
      </div>
      <div className="mapCanvas">
        <div className="ethiopiaSilhouette" />
        <div className="terrainLine terrainLineA" />
        <div className="terrainLine terrainLineB" />
        <div className="terrainLine terrainLineC" />
        {areas.map((area, index) => {
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
        })}
        <div className="mapTodo">Mock map now. TODO: replace with CesiumJS or real GeoJSON polygons.</div>
      </div>
    </section>
  );
}

function priorityClass(score: number) {
  if (score >= 80) return "priorityHigh";
  if (score >= 70) return "priorityMedium";
  return "priorityReview";
}
