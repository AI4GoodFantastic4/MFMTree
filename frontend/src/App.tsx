import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CostEstimate,
  explainArea,
  getAreas,
  getCostEstimate,
  getFieldBrief,
  getHealth,
  mockAreas,
  runScenario,
} from "./api/client";
import { AIAdvisorAvatar, AdvisorState } from "./components/AIAdvisorAvatar";
import { AreaComparison } from "./components/AreaComparison";
import { AreaDashboard } from "./components/AreaDashboard";
import { MapMock } from "./components/MapMock";

export default function App() {
  const [areas, setAreas] = useState<Area[]>(mockAreas);
  const [selectedAreaId, setSelectedAreaId] = useState("ET-001");
  const [areaA, setAreaA] = useState("ET-001");
  const [areaB, setAreaB] = useState("ET-002");
  const [explanation, setExplanation] = useState("Loading advisor explanation...");
  const [fieldBrief, setFieldBrief] = useState("Loading field brief...");
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [scenarioResult, setScenarioResult] = useState("");
  const [advisorState, setAdvisorState] = useState<AdvisorState>("idle");
  const [health, setHealth] = useState("checking");
  const [comparing, setComparing] = useState(false);

  const selectedArea = useMemo(
    () => areas.find((area) => area.areaId === selectedAreaId) || areas[0],
    [areas, selectedAreaId],
  );

  useEffect(() => {
    getHealth().then((data) => setHealth(data.status));
    getAreas().then((data) => {
      setAreas(data);
      if (data[0]) setSelectedAreaId(data[0].areaId);
      if (data[1]) setAreaB(data[1].areaId);
    });
  }, []);

  useEffect(() => {
    if (!selectedAreaId) return;
    setAdvisorState("thinking");
    Promise.all([explainArea(selectedAreaId), getCostEstimate(selectedAreaId), getFieldBrief(selectedAreaId)]).then(
      ([explain, cost, brief]) => {
        setExplanation(explain);
        setCostEstimate(cost);
        setFieldBrief(brief);
        setAdvisorState(cost?.costWarnings?.length || selectedArea.riskFlags.length ? "warning" : "speaking");
      },
    );
  }, [selectedAreaId]);

  async function compareAreas() {
    setComparing(true);
    setAdvisorState("comparing");
    const result = await runScenario({ name: "Hackathon area comparison", areaIds: [areaA, areaB] });
    if (result.scoresByArea) {
      setAreas((currentAreas) =>
        currentAreas.map((area) => ({
          ...area,
          ...(result.scoresByArea?.[area.areaId] || {}),
        })),
      );
    }
    setScenarioResult(result.analysis);
    const hasRisk = [areaA, areaB].some((id) => {
      const dynamicRisk = result.scoresByArea?.[id]?.riskScore;
      return (dynamicRisk ?? areas.find((area) => area.areaId === id)?.riskScore ?? 0) > 55;
    });
    setAdvisorState(hasRisk ? "warning" : "recommendation");
    setComparing(false);
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Menschen fuer Menschen decision support</p>
          <h1>Reforestation Priority Platform</h1>
        </div>
        <div className="statusPill">API: {health}</div>
      </header>
      <section className="workspace">
        <div className="leftColumn">
          <MapMock areas={areas} selectedAreaId={selectedAreaId} onSelect={setSelectedAreaId} />
          <AreaComparison
            areas={areas}
            areaA={areaA}
            areaB={areaB}
            onAreaA={setAreaA}
            onAreaB={setAreaB}
            onCompare={compareAreas}
            result={scenarioResult}
            loading={comparing}
          />
          <AIAdvisorAvatar
            state={advisorState}
            message={
              advisorState === "idle"
                ? "Select an area or run a comparison."
                : advisorState === "comparing"
                  ? "Comparing priority, carbon return, cost, readiness, and risk."
                  : explanation
            }
          />
        </div>
        <AreaDashboard area={selectedArea} explanation={explanation} costEstimate={costEstimate} fieldBrief={fieldBrief} />
      </section>
    </main>
  );
}
