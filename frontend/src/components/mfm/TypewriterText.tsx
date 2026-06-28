import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  text: string;
  speedMs?: number;
  className?: string;
  onComplete?: () => void;
  controlsLabel?: string;
};

export function TypewriterText({ text, speedMs = 22, className, onComplete, controlsLabel = "Skip" }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const onCompleteRef = useRef(onComplete);

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setVisibleCount(reducedMotion ? text.length : 0);
    setSkipped(reducedMotion);
    if (reducedMotion) onCompleteRef.current?.();
  }, [reducedMotion, text]);

  useEffect(() => {
    if (reducedMotion || skipped || visibleCount >= text.length) return;

    const timer = window.setTimeout(() => {
      setVisibleCount((count) => {
        const next = Math.min(text.length, count + 1);
        if (next === text.length) window.setTimeout(() => onCompleteRef.current?.(), 0);
        return next;
      });
    }, speedMs);

    return () => window.clearTimeout(timer);
  }, [reducedMotion, skipped, speedMs, text.length, visibleCount]);

  const complete = visibleCount >= text.length;

  const skip = () => {
    if (complete) return;
    setSkipped(true);
    setVisibleCount(text.length);
    onCompleteRef.current?.();
  };

  return (
    <span className={className} onClick={skip} role="presentation">
      {text.slice(0, visibleCount)}
      {!complete && <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded-sm bg-[var(--habtamu-cursor,#0f766e)] align-[-2px]" />}
      {!complete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            skip();
          }}
          className="ml-2 inline-flex rounded border border-[var(--habtamu-border,rgba(15,118,110,.24))] px-1.5 py-0.5 text-[10px] font-medium text-[var(--habtamu-accent-strong,#0f766e)] hover:bg-[var(--habtamu-hover-bg,rgba(15,23,42,.06))]"
        >
          {controlsLabel}
        </button>
      )}
    </span>
  );
}
