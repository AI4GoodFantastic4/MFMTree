import { useCallback, useEffect, useMemo, useState } from "react";
import { CELLS, computeScore, DEFAULT_WEIGHTS, type CellFeature, type Weights } from "@/lib/cells";
import { frontendWeightsToBackend, loadBackendCells, mergeBackendScores, runScenario } from "@/lib/api";

export function useScoring() {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [cells, setCells] = useState<CellFeature[]>(CELLS);
  const [dataSource, setDataSource] = useState("local demo");
  const [usingDemoData, setUsingDemoData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await loadBackendCells();
        if (cancelled) return;
        setCells(result.cells);
        setDataSource(result.source);
        setUsingDemoData(result.usingDemoData);
        console.info(`Loaded geometry features: ${result.cells.length}`, `Geometry source: ${result.source}`);
      } catch (err) {
        if (cancelled) return;
        setCells(CELLS);
        setDataSource("local fallback");
        setUsingDemoData(true);
        setError(err instanceof Error ? err.message : "Could not load backend area data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setWeight = useCallback((key: keyof Weights, value: number) => {
    setWeights((prev) => {
      const others = (Object.keys(prev) as (keyof Weights)[]).filter((k) => k !== key);
      const remaining = 1 - value;
      const othersTotal = others.reduce((s, k) => s + prev[k], 0);
      const next: Weights = { ...prev, [key]: value };
      if (othersTotal <= 0) {
        const eq = remaining / others.length;
        others.forEach((k) => (next[k] = eq));
      } else {
        others.forEach((k) => (next[k] = (prev[k] / othersTotal) * remaining));
      }
      return next;
    });
  }, []);

  const setPreset = useCallback((w: Weights) => setWeights(w), []);

  useEffect(() => {
    if (usingDemoData) return;
    let cancelled = false;

    async function updateScenarioScores() {
      try {
        const result = await runScenario(frontendWeightsToBackend(weights));
        if (cancelled || !result.scoresByArea) return;
        setCells((prev) => mergeBackendScores(prev, result.scoresByArea || {}));
        console.info(`Updated scores for areas: ${Object.keys(result.scoresByArea).length}`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Scenario scoring failed; keeping last scores.");
        }
      }
    }

    updateScenarioScores();
    return () => {
      cancelled = true;
    };
  }, [weights, usingDemoData]);

  const scored = useMemo(() => {
    return cells.map((f) => ({
      feature: f,
      score: computeScore(f.properties, weights),
    })).sort((a, b) => b.score - a.score);
  }, [cells, weights]);

  return { weights, setWeight, setPreset, scored, cells, dataSource, usingDemoData, loading, error };
}
