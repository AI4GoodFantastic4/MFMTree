import type { Area, CostEstimate } from "../api/client";

type Props = {
  area: Area;
  explanation: string;
  costEstimate: CostEstimate | null;
  fieldBrief: string;
};

export function AreaDashboard({ area, explanation, costEstimate, fieldBrief }: Props) {
  return (
    <aside className="dashboardPanel">
      <div className="sectionTitle">
        <span>{area.region}</span>
        <h2>{area.name}</h2>
      </div>
      <div className="scoreHero">
        <span>Priority Score</span>
        <strong>{area.priorityScore}</strong>
        <em>{area.recommendedAction}</em>
      </div>
      <div className="scoreGrid">
        <Metric label="Carbon" value={area.carbonScore} />
        <Metric label="Survival" value={area.treeSurvivalScore} />
        <Metric label="Cost efficiency" value={area.costEfficiencyScore} />
        <Metric label="Livelihood" value={area.livelihoodScore} />
      </div>
      <div className="readinessRow">
        <span>Carbon-credit readiness</span>
        <strong className={`readiness readiness-${area.carbonCreditReadiness}`}>{area.carbonCreditReadiness}</strong>
      </div>
      {costEstimate && (
        <div className="costBox">
          <h3>Planning Cost Estimate</h3>
          <div className="costStats">
            <span>Total</span>
            <strong>
              {costEstimate.estimatedTotalCost.toLocaleString()} {costEstimate.currency}
            </strong>
            <span>Per ha</span>
            <strong>{costEstimate.estimatedCostPerHa ?? "n/a"}</strong>
            <span>Per tCO2e</span>
            <strong>{costEstimate.estimatedCostPerTCO2e ?? "n/a"}</strong>
          </div>
          <p>{costEstimate.costDrivers.slice(0, 3).join(" • ")}</p>
        </div>
      )}
      <InfoList title="Risk flags" items={area.riskFlags} tone="warning" />
      <InfoList title="Evidence" items={area.evidence} />
      <InfoList title="Uncertainties" items={area.uncertainties} />
      <div className="advisorText">
        <h3>AI advisor</h3>
        <p>{explanation}</p>
      </div>
      <div className="fieldBrief">
        <h3>Field brief</h3>
        <p>{fieldBrief}</p>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="bar"><i style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function InfoList({ title, items, tone }: { title: string; items: string[]; tone?: "warning" }) {
  return (
    <div className={`infoList ${tone || ""}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
