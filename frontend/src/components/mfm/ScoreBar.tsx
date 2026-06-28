import { useEffect, useMemo, useState } from "react";
import { scoreColor } from "@/lib/cells";

interface Props {
  label: string;
  value: number | undefined | null;
  previousValue?: number | null;
  inverse?: boolean;
  compact?: boolean;
}

const clampScore = (value: number | undefined | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
};

export function ScoreBar({ label, value, previousValue, inverse = false, compact = false }: Props) {
  const current = clampScore(value);
  const previous = previousValue == null ? undefined : clampScore(previousValue);
  const delta = previous == null ? 0 : current - previous;
  const meaningful = Math.abs(delta) >= 0.5;
  const positiveChange = inverse ? delta < 0 : delta > 0;
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!meaningful) return;
    setPulse(positiveChange ? "up" : "down");
    const timer = window.setTimeout(() => setPulse(null), 850);
    return () => window.clearTimeout(timer);
  }, [current, meaningful, positiveChange]);

  const feedback = useMemo(() => {
    if (pulse === "up") return { color: "#00A86B", shadow: "0 0 0 1px rgba(0,168,107,.65)" };
    if (pulse === "down") return { color: "#EF4444", shadow: "0 0 0 1px rgba(239,68,68,.65)" };
    return { color: scoreColor(current), shadow: "none" };
  }, [current, pulse]);

  return (
    <div
      className={`rounded-md border border-[var(--mfm-border)] bg-[var(--mfm-surface-2)] transition-[box-shadow,background-color,border-color] duration-300 ${
        compact ? "p-2" : "p-2.5"
      }`}
      style={{
        boxShadow: feedback.shadow,
        borderColor: pulse === "up" ? "rgba(0,168,107,.75)" : pulse === "down" ? "rgba(239,68,68,.75)" : undefined,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-[var(--mfm-text)]">{label}</span>
        <span className="flex items-center gap-1 font-mono">
          <span style={{ color: feedback.color }}>{current.toFixed(1)}</span>
          {meaningful && (
            <span
              className="rounded px-1 py-0.5 text-[10px] font-semibold"
              style={{
                color: positiveChange ? "#00A86B" : "#EF4444",
                background: positiveChange ? "rgba(0,168,107,.12)" : "rgba(239,68,68,.12)",
              }}
            >
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}
            </span>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--mfm-border)]">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
          style={{
            width: `${current}%`,
            backgroundColor: feedback.color,
          }}
        />
      </div>
    </div>
  );
}
