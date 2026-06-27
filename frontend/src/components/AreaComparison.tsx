import type { Area } from "../api/client";

type Props = {
  areas: Area[];
  areaA: string;
  areaB: string;
  result: string;
  onAreaA: (id: string) => void;
  onAreaB: (id: string) => void;
  onCompare: () => void;
  loading: boolean;
};

export function AreaComparison({ areas, areaA, areaB, result, onAreaA, onAreaB, onCompare, loading }: Props) {
  return (
    <section className="comparisonPanel">
      <div className="sectionTitle compact">
        <span>Scenario mode</span>
        <h2>Compare two areas</h2>
      </div>
      <div className="compareControls">
        <Select label="Area A" value={areaA} areas={areas} onChange={onAreaA} />
        <Select label="Area B" value={areaB} areas={areas} onChange={onAreaB} />
        <button type="button" onClick={onCompare} disabled={loading || areaA === areaB}>
          {loading ? "Comparing..." : "Compare Areas"}
        </button>
      </div>
      <div className="comparisonResult">
        <p>{result || "Select two candidate areas to compare carbon return, access, cost, readiness, and risk."}</p>
      </div>
    </section>
  );
}

function Select({ label, value, areas, onChange }: { label: string; value: string; areas: Area[]; onChange: (id: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {areas.map((area) => (
          <option value={area.areaId} key={area.areaId}>
            {area.areaId} - {area.name}
          </option>
        ))}
      </select>
    </label>
  );
}
