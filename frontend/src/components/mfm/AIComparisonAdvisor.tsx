import { AlertTriangle, CheckCircle2, ChevronDown, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { synthesizeSpeech, type TtsAlignmentSegment } from "@/lib/api";
import { TypewriterText } from "@/components/mfm/TypewriterText";

export type VerdaState = "idle" | "thinking" | "comparing" | "speaking" | "warning" | "recommendation";

export type ComparisonAdvisorResult = {
  recommendedAreaLabel?: string;
  confidence?: string;
  explanation?: string;
  keyTradeoffs?: string[];
  riskFlags?: string[];
  fieldValidationQuestions?: string[];
  decisionBasis?: string[];
};

type Props = {
  state: VerdaState;
  result?: ComparisonAdvisorResult | null;
  onDismiss?: () => void;
  onNarrativeComplete?: () => void;
  note?: string | null;
};

type PreparedSpeech = Awaited<ReturnType<typeof synthesizeSpeech>> & {
  preparedText: string;
  preparedAlignment: TtsAlignmentSegment[];
};

const STATUS_COPY: Record<VerdaState, { eyebrow: string; headline: string; body: string }> = {
  idle: {
    eyebrow: "AI advisor",
    headline: "Select two areas",
    body: "HabtamuAI will compare carbon, cost, risk, and carbon-credit readiness once both areas are selected.",
  },
  thinking: {
    eyebrow: "Thinking",
    headline: "Analysing both areas...",
    body: "Analysing both areas...",
  },
  comparing: {
    eyebrow: "Comparing",
    headline: "Comparing the investment case...",
    body: "Comparing carbon potential, cost, survival chances, and risks...",
  },
  speaking: {
    eyebrow: "Recommendation",
    headline: "HabtamuAI is explaining the comparison",
    body: "Review the reasoning as pre-screening guidance before field validation.",
  },
  warning: {
    eyebrow: "Risk review",
    headline: "Risk flags need attention",
    body: "Some assumptions should be checked onsite before prioritising investment.",
  },
  recommendation: {
    eyebrow: "Recommended next step",
    headline: "Validate the recommended area first",
    body: "This is a planning recommendation, not final project approval.",
  },
};

export function AIComparisonAdvisor({ state, result, onDismiss, onNarrativeComplete, note }: Props) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [isAudioSpeaking, setIsAudioSpeaking] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [alignment, setAlignment] = useState<TtsAlignmentSegment[]>([]);
  const [spokenText, setSpokenText] = useState("");
  const [preparedSpeech, setPreparedSpeech] = useState<PreparedSpeech | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const progressStartedAtRef = useRef(0);
  const status = STATUS_COPY[state];
  const effectiveState = isAudioSpeaking ? "speaking" : state;
  const headline = result?.recommendedAreaLabel
    ? `HabtamuAI recommends ${result.recommendedAreaLabel}`
    : status.headline;
  const speechText = result?.explanation || status.body;
  const confidence = state === "idle" ? undefined : "high";
  const showRecommendationBadge = state === "recommendation" && Boolean(result?.recommendedAreaLabel);
  const canRead = typeof window !== "undefined" && "speechSynthesis" in window;

  const readText = useMemo(() => speechText.trim(), [speechText]);

  useEffect(() => {
    if (!canRead) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [canRead]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      stopProgressTimer();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPreparedSpeech(null);
    setTtsError(null);
    if (!result?.explanation || !readText) return;

    async function prepareVoice() {
      setVoicePreparing(true);
      try {
        const tts = await synthesizeSpeech(readText);
        if (cancelled) return;
        const preparedText = tts.normalizedText || readText;
        const preparedAlignment = tts.alignment?.length ? tts.alignment : estimateAlignment(preparedText);
        setPreparedSpeech({ ...tts, preparedText, preparedAlignment });
      } catch (error) {
        if (!cancelled) {
          if (import.meta.env.DEV) console.warn("Voice prefetch failed.", error);
          setPreparedSpeech(null);
        }
      } finally {
        if (!cancelled) setVoicePreparing(false);
      }
    }

    prepareVoice();
    return () => {
      cancelled = true;
    };
  }, [readText, result?.explanation]);

  const handleReadAloud = async () => {
    if (!readText || voiceLoading) return;
    setVoiceLoading(true);
    setTtsError(null);
    setCurrentTimeMs(0);
    setSpokenText(readText);
    try {
      const tts =
        preparedSpeech?.preparedText === readText
          ? preparedSpeech
          : await synthesizeSpeech(readText).then((fresh) => {
              const preparedText = fresh.normalizedText || readText;
              const preparedAlignment = fresh.alignment?.length
                ? fresh.alignment
                : estimateAlignment(preparedText);
              return { ...fresh, preparedText, preparedAlignment };
            });
      await playPreparedSpeech(tts);
      return;
    } catch (error) {
      if (import.meta.env.DEV) console.warn("ElevenLabs voice unavailable; using browser speech fallback.", error);
      const fallbackAlignment = estimateAlignment(readText);
      setAlignment(fallbackAlignment);
      speakWithBrowserVoice(readText, voices, fallbackAlignment);
      setTtsError("Voice service unavailable; using local browser voice.");
    }
    setVoiceLoading(false);
  };

  const canReadAloud = Boolean(readText) && (canRead || typeof window !== "undefined");

  async function playPreparedSpeech(tts: PreparedSpeech) {
    const nextText = tts.preparedText;
    const nextAlignment = tts.preparedAlignment;
    setSpokenText(nextText);
    setAlignment(nextAlignment);
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    stopProgressTimer();
    if (!tts.audioBlob) {
      speakWithBrowserVoice(nextText, voices, nextAlignment);
      setVoiceLoading(false);
      if (tts.fallback) setTtsError("Using local browser voice; ElevenLabs audio is unavailable.");
      return;
    }
    const url = URL.createObjectURL(tts.audioBlob);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => {
      setVoiceLoading(false);
      setIsAudioSpeaking(true);
    };
    audio.ontimeupdate = () => setCurrentTimeMs(audio.currentTime * 1000);
    audio.onpause = () => {
      if (!audio.ended) setIsAudioSpeaking(false);
    };
    audio.onended = () => {
      setVoiceLoading(false);
      setCurrentTimeMs(nextAlignment.at(-1)?.endMs || audio.duration * 1000 || 0);
      setIsAudioSpeaking(false);
      URL.revokeObjectURL(url);
      if (audioUrlRef.current === url) audioUrlRef.current = null;
    };
    audio.onerror = () => {
      setVoiceLoading(false);
      setIsAudioSpeaking(false);
      URL.revokeObjectURL(url);
      if (audioUrlRef.current === url) audioUrlRef.current = null;
      speakWithBrowserVoice(nextText, voices, nextAlignment);
      setTtsError("ElevenLabs audio playback failed; using local browser voice.");
    };
    await audio.play();
  }

  function speakWithBrowserVoice(
    text: string,
    availableVoices: SpeechSynthesisVoice[],
    nextAlignment = estimateAlignment(text),
  ) {
    if (!canRead) {
      setIsAudioSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    setSpokenText(text);
    setAlignment(nextAlignment);
    startProgressTimer(nextAlignment);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectNaturalVoice(availableVoices.length ? availableVoices : window.speechSynthesis.getVoices());
    utterance.lang = utterance.voice?.lang || "en-US";
    utterance.rate = 0.88;
    utterance.pitch = 0.96;
    utterance.volume = 0.95;
    utterance.onstart = () => setIsAudioSpeaking(true);
    utterance.onend = () => {
      setVoiceLoading(false);
      setCurrentTimeMs(nextAlignment.at(-1)?.endMs || 0);
      setIsAudioSpeaking(false);
      stopProgressTimer();
    };
    utterance.onerror = () => {
      setVoiceLoading(false);
      setIsAudioSpeaking(false);
      stopProgressTimer();
      setTtsError("Local browser voice failed. Text remains visible.");
    };
    window.speechSynthesis.speak(utterance);
  }

  function startProgressTimer(nextAlignment: TtsAlignmentSegment[]) {
    stopProgressTimer();
    setCurrentTimeMs(0);
    progressStartedAtRef.current = performance.now();
    progressTimerRef.current = window.setInterval(() => {
      setCurrentTimeMs(performance.now() - progressStartedAtRef.current);
    }, 80);
    window.setTimeout(() => {
      if (progressTimerRef.current) setCurrentTimeMs(nextAlignment.at(-1)?.endMs || 0);
    }, nextAlignment.at(-1)?.endMs || 0);
  }

  function stopProgressTimer() {
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
  }

  return (
    <section className="habtamu-advisor relative overflow-hidden rounded-lg border p-4 shadow-2xl">
      <VerdaStyles />
      <div className="habtamu-advisor-glow absolute inset-0" />
      <div className="relative flex gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <VerdaAvatar state={effectiveState} />
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ borderColor: badgeColor(effectiveState), color: badgeColor(effectiveState) }}
          >
            {isAudioSpeaking ? "Speaking" : status.eyebrow}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="verda-bubble habtamu-bubble relative rounded-lg border p-4 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold leading-tight text-[var(--habtamu-text)]">{headline}</h3>
                  {showRecommendationBadge && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#00A86B]/50 bg-[#00A86B]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00A86B]">
                      <CheckCircle2 className="h-3 w-3" /> Recommended for field validation
                    </span>
                  )}
                  {confidence && <ConfidenceBadge confidence={confidence} />}
                </div>
                <p className="min-h-[3.5rem] text-sm leading-relaxed text-[var(--habtamu-text)]">
                  {isAudioSpeaking || alignment.length ? (
                    <SpokenTextHighlighter
                      text={spokenText || speechText}
                      alignment={alignment}
                      currentTimeMs={currentTimeMs}
                    />
                  ) : (
                    <TypewriterText
                      key={speechText}
                      text={speechText}
                      speedMs={state === "thinking" || state === "comparing" ? 18 : 20}
                      onComplete={state === "speaking" ? onNarrativeComplete : undefined}
                    />
                  )}
                </p>
              </div>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-md p-1 text-[var(--habtamu-muted)] transition-colors hover:bg-[var(--habtamu-hover-bg)] hover:text-[var(--habtamu-text)]"
                  aria-label="Dismiss HabtamuAI comparison advisor"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {state === "thinking" || state === "comparing" ? <ThinkingDots /> : null}

            {result && (
              <div className="habtamu-evidence mt-3 rounded-md border">
                <button
                  type="button"
                  onClick={() => setEvidenceOpen((open) => !open)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--habtamu-muted)]"
                >
                  Show evidence details
                  <ChevronDown className={`h-4 w-4 transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />
                </button>
                {evidenceOpen && (
                  <div className="space-y-3 border-t border-[var(--habtamu-border)] px-3 py-3">
                    <EvidenceSection title="Key tradeoffs" items={result.keyTradeoffs || []} />
                    <EvidenceSection title="Risk flags" items={result.riskFlags || []} warning />
                    <EvidencePills items={result.decisionBasis || []} />
                    <EvidenceSection title="Field validation questions" items={result.fieldValidationQuestions || []} />
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--habtamu-border)] pt-3">
              <p className="text-[10px] italic text-[var(--habtamu-muted)]">Pre-screening only. Experts validate onsite.</p>
              <button
                type="button"
                onClick={handleReadAloud}
                disabled={!canReadAloud || voiceLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--habtamu-border)] px-2 py-1 text-[11px] font-medium text-[var(--habtamu-muted)] transition-colors hover:border-[var(--habtamu-accent)] hover:text-[var(--habtamu-accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Volume2 className="h-3.5 w-3.5" />{" "}
                {voiceLoading
                  ? "Starting voice..."
                  : voicePreparing
                    ? "Preparing voice..."
                    : "Read aloud"}
              </button>
            </div>

            {ttsError && <p className="mt-2 text-[10px] text-[#F59E0B]">{ttsError}</p>}
            {note && <p className="mt-2 text-[10px] text-[#F59E0B]">{note}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function SpokenTextHighlighter({
  text,
  alignment,
  currentTimeMs,
}: {
  text: string;
  alignment: TtsAlignmentSegment[];
  currentTimeMs: number;
}) {
  const segments = alignment.length ? alignment : estimateAlignment(text);
  return (
    <>
      {segments.map((segment, index) => {
        const spoken = currentTimeMs >= segment.endMs;
        const active = currentTimeMs >= segment.startMs && currentTimeMs < segment.endMs;
        return (
          <span
            key={`${segment.text}-${index}-${segment.startMs}`}
            className="habtamu-spoken-word transition-[color,text-shadow,opacity] duration-150"
            data-active={active || undefined}
            data-spoken={spoken || undefined}
          >
            {segment.text}
            {index < segments.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

function estimateAlignment(text: string): TtsAlignmentSegment[] {
  const words = text.match(/\S+/g) || [];
  const msPerWord = 60000 / 155;
  return words.map((word, index) => ({
    text: word,
    startMs: Math.round(index * msPerWord),
    endMs: Math.round((index + 1) * msPerWord),
  }));
}

function selectNaturalVoice(voices: SpeechSynthesisVoice[]) {
  if (!voices.length) return null;

  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const candidates = englishVoices.length ? englishVoices : voices;
  const preferredNames = [
    "samantha",
    "karen",
    "daniel",
    "tessa",
    "moira",
    "rishi",
    "google us english",
    "google uk english female",
    "google uk english male",
    "microsoft aria",
    "microsoft jenny",
    "microsoft guy",
    "natural",
    "neural",
  ];

  for (const preferred of preferredNames) {
    const match = candidates.find((voice) => voice.name.toLowerCase().includes(preferred));
    if (match) return match;
  }

  const localVoice = candidates.find((voice) => voice.localService);
  return localVoice || candidates[0];
}

function VerdaAvatar({ state }: { state: VerdaState }) {
  return (
    <span className="verda" data-state={state} role="img" aria-label="HabtamuAI advisor">
      <svg viewBox="0 0 120 132" width="96" height="106">
        <defs>
          <radialGradient id="vOrbReact" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#1d4f50" />
            <stop offset="55%" stopColor="#0f3334" />
            <stop offset="100%" stopColor="#06181b" />
          </radialGradient>
          <linearGradient id="vLeafReact" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#74e9aa" />
            <stop offset="100%" stopColor="#27b487" />
          </linearGradient>
          <filter id="vSoftReact" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <clipPath id="vClipReact">
            <circle cx="60" cy="64" r="31.5" />
          </clipPath>
        </defs>

        <g className="va-float">
          <circle className="v-glow" cx="60" cy="64" r="41" filter="url(#vSoftReact)" />
          <g transform="rotate(-20 60 64)">
            <g className="va-spin">
              <ellipse className="v-ring" cx="60" cy="64" rx="52" ry="16.5" fill="none" strokeWidth="1" />
              {[112, 96.8, 60, 23.2, 8, 23.2, 60, 96.8].map((cx, index) => (
                <circle key={`${cx}-${index}`} cx={cx} cy={[64, 75.7, 80.5, 75.7, 64, 52.3, 47.5, 52.3][index]} r={index % 2 === 0 ? 1.7 : 1.5} fill="#7df0dc" />
              ))}
            </g>
          </g>

          <g className="va-breathe">
            <circle cx="60" cy="64" r="31.5" fill="url(#vOrbReact)" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
            <g clipPath="url(#vClipReact)" stroke="rgba(125,240,220,.16)" strokeWidth=".8" fill="none">
              <ellipse cx="60" cy="64" rx="31" ry="10" />
              <ellipse cx="60" cy="54" rx="29" ry="7" />
              <ellipse cx="60" cy="74" rx="29" ry="7" />
              <ellipse cx="60" cy="64" rx="11" ry="31" />
            </g>
            <ellipse cx="50" cy="52" rx="9" ry="6" fill="rgba(255,255,255,.12)" transform="rotate(-30 50 52)" />
          </g>

          <g className="va-sway">
            <path d="M60 36 C60 28 60 23 60 16" stroke="#3fbf8f" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M60 25 C50 23 45 15 51 9 C58 12 61 19 60 25Z" fill="url(#vLeafReact)" />
            <path d="M60 28 C70 26 75 18 69 12 C62 15 59 22 60 28Z" fill="url(#vLeafReact)" />
            <path d="M60 31 L66 31" stroke="rgba(125,240,220,.6)" strokeWidth="1" strokeLinecap="round" />
            <circle cx="67.5" cy="31" r="1.3" fill="#7df0dc" />
            <circle cx="60" cy="15.5" r="1.8" fill="#bdfbe6" />
          </g>

          <g className="v-face v-idle">
            <circle cx="60" cy="64" r="12.5" fill="none" stroke="rgba(125,240,220,.55)" strokeWidth="1.4" />
            <circle cx="60" cy="64" r="8" fill="#08211f" />
            <g className="va-blink">
              <circle cx="60" cy="64" r="4.6" fill="#34e0cb" />
              <circle cx="58.3" cy="62.2" r="1.5" fill="#dffff7" />
            </g>
          </g>

          <g className="v-face v-thinking">
            <circle className="v-cell v-thinking-ring" cx="60" cy="64" r="12.5" fill="none" stroke="rgba(108,192,242,.6)" strokeWidth="1.4" strokeDasharray="5 4" />
            {[54, 60, 66].map((cx, index) => (
              <circle key={cx} className="v-cell v-thinking-dot" cx={cx} cy="64" r="2.2" fill="#6cc0f2" style={{ animationDelay: `${index * 0.2}s` }} />
            ))}
          </g>

          <g className="v-face v-comparing">
            <circle cx="60" cy="64" r="12.5" fill="none" stroke="rgba(125,240,220,.45)" strokeWidth="1.3" />
            <path d="M60 53.5 A10.5 10.5 0 0 0 60 74.5Z" fill="#34e0cb" opacity=".92" />
            <path d="M60 53.5 A10.5 10.5 0 0 1 60 74.5Z" fill="#6cc0f2" opacity=".92" />
            <line x1="60" y1="51" x2="60" y2="77" stroke="#08211f" strokeWidth="1.4" />
            <rect className="v-cell v-bar-a" x="54.5" y="59" width="2.6" height="9" rx="1" fill="#06181b" />
            <rect className="v-cell v-bar-b" x="62.9" y="59" width="2.6" height="9" rx="1" fill="#06181b" />
          </g>

          <g className="v-face v-speaking">
            <circle cx="60" cy="64" r="12.5" fill="none" stroke="rgba(95,227,170,.45)" strokeWidth="1.3" />
            {[51.5, 56, 60.5, 65].map((x, index) => (
              <rect key={x} className="v-cell v-eq" x={x} y={[60, 58, 57, 59][index]} width="2.6" height={[8, 12, 14, 10][index]} rx="1.3" fill="#5fe3b0" style={{ animationDelay: `${index * 0.18}s` }} />
            ))}
          </g>

          <g className="v-face v-recommendation">
            <circle cx="60" cy="64" r="12.5" fill="none" stroke="rgba(95,227,154,.85)" strokeWidth="1.6" />
            <circle cx="60" cy="64" r="9" fill="#0c2a22" />
            <path d="M54.5 64.5 L58.5 68.5 L66 60" fill="none" stroke="#7cf0a8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </g>

          <g className="v-face v-warning v-cell">
            <circle cx="60" cy="64" r="12.5" fill="none" stroke="rgba(236,178,76,.8)" strokeWidth="1.5" />
            <circle cx="60" cy="64" r="8.5" fill="#2a2110" />
            <rect x="58.7" y="58.5" width="2.6" height="6.8" rx="1.3" fill="#f1c25e" />
            <circle cx="60" cy="69" r="1.6" fill="#f1c25e" />
          </g>
        </g>
      </svg>
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const value = confidence.toLowerCase();
  const color = value === "high" ? "#00A86B" : value === "low" ? "#F59E0B" : "#1fd6c0";
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: `${color}80`, color }}>
      {confidence} confidence
    </span>
  );
}

function ThinkingDots() {
  return (
    <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--habtamu-muted)]">
      <span className="verda-dot" />
      <span className="verda-dot [animation-delay:.15s]" />
      <span className="verda-dot [animation-delay:.3s]" />
    </div>
  );
}

function EvidenceSection({ title, items, warning = false }: { title: string; items: string[]; warning?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider ${warning ? "text-[#B45309]" : "text-[var(--habtamu-muted)]"}`}>
        {warning && <AlertTriangle className="h-3.5 w-3.5" />}
        {title}
      </div>
      <ul className="space-y-1 text-xs text-[var(--habtamu-text)]">
        {items.slice(0, 6).map((item) => (
          <li key={item} className="flex gap-2">
            <span className={warning ? "text-[#B45309]" : "text-[var(--habtamu-muted)]"}>-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidencePills({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 4).map((basis) => (
        <span key={basis} className="habtamu-evidence-pill inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px]">
          <CheckCircle2 className="h-3 w-3" /> {basis}
        </span>
      ))}
    </div>
  );
}

function badgeColor(state: VerdaState) {
  if (state === "warning") return "#F59E0B";
  if (state === "recommendation") return "#00A86B";
  if (state === "thinking" || state === "comparing") return "#6cc0f2";
  return "#1fd6c0";
}

function VerdaStyles() {
  return (
    <style>{`
      .habtamu-advisor{--habtamu-text:#edf6ff;--habtamu-muted:#9fb0cf;--habtamu-border:rgba(125,240,220,.22);--habtamu-bubble-bg:rgba(10,15,30,.74);--habtamu-evidence-bg:rgba(0,0,0,.14);--habtamu-hover-bg:rgba(255,255,255,.1);--habtamu-accent:#1fd6c0;--habtamu-accent-strong:#9cf5dd;--habtamu-pill-bg:rgba(31,214,192,.1);--habtamu-cursor:#9cf5dd;border-color:var(--habtamu-border);background:linear-gradient(135deg,rgba(13,20,36,.96),rgba(8,26,30,.92));color:var(--habtamu-text)}
      .habtamu-advisor-glow{background:radial-gradient(circle at 12% 12%,rgba(31,214,192,.16),transparent 28%),radial-gradient(circle at 86% 22%,rgba(0,112,255,.12),transparent 32%)}
      .habtamu-bubble{border-color:var(--habtamu-border);background:var(--habtamu-bubble-bg);color:var(--habtamu-text)}
      .habtamu-evidence{border-color:var(--habtamu-border);background:var(--habtamu-evidence-bg)}
      .habtamu-evidence-pill{border-color:var(--habtamu-border);background:var(--habtamu-pill-bg);color:var(--habtamu-accent-strong)}
      .habtamu-spoken-word{color:var(--habtamu-text);opacity:.86}
      .habtamu-spoken-word[data-spoken="true"]{color:var(--habtamu-accent-strong);opacity:1}
      .habtamu-spoken-word[data-active="true"]{color:var(--habtamu-accent-strong);opacity:1;text-shadow:0 0 10px rgba(31,214,192,.78),0 0 18px rgba(31,214,192,.42)}
      [data-mfm-theme="light"] .habtamu-advisor{--habtamu-text:#0f172a;--habtamu-muted:#475569;--habtamu-border:rgba(14,116,144,.22);--habtamu-bubble-bg:rgba(255,255,255,.9);--habtamu-evidence-bg:rgba(15,118,110,.06);--habtamu-hover-bg:rgba(15,23,42,.06);--habtamu-accent:#0f766e;--habtamu-accent-strong:#0f766e;--habtamu-pill-bg:rgba(15,118,110,.08);--habtamu-cursor:#0f766e;background:linear-gradient(135deg,rgba(248,250,252,.98),rgba(236,253,245,.94));box-shadow:0 18px 40px rgba(15,23,42,.12)}
      [data-mfm-theme="light"] .habtamu-advisor-glow{background:radial-gradient(circle at 12% 12%,rgba(20,184,166,.16),transparent 30%),radial-gradient(circle at 86% 22%,rgba(37,99,235,.1),transparent 34%)}
      .verda{--glow:#1fd6c0;--ring:rgba(120,230,210,.3);display:inline-block;line-height:0;filter:drop-shadow(0 18px 24px rgba(0,0,0,.28))}
      .verda svg{display:block;overflow:visible}.verda[data-state="thinking"]{--glow:#4ba9ee}.verda[data-state="comparing"]{--glow:#4ba9ee}.verda[data-state="recommendation"]{--glow:#4fe39a}.verda[data-state="warning"]{--glow:#ecb24c}
      .verda .v-face{display:none}.verda[data-state="idle"] .v-idle,.verda[data-state="thinking"] .v-thinking,.verda[data-state="comparing"] .v-comparing,.verda[data-state="speaking"] .v-speaking,.verda[data-state="recommendation"] .v-recommendation,.verda[data-state="warning"] .v-warning{display:block}
      .verda .v-glow{fill:var(--glow);animation:v-glow 5s ease-in-out infinite}.verda[data-state="warning"] .v-glow{animation:v-pulse 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}.verda[data-state="recommendation"] .v-glow{animation:v-glow-strong 3.2s ease-in-out infinite}.verda .v-ring{stroke:var(--ring)}
      .v-cell{transform-box:fill-box;transform-origin:center}.va-float{animation:v-float 6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}.va-spin{animation:v-spin 18s linear infinite;transform-box:fill-box;transform-origin:center}.va-breathe{animation:v-breathe 6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}.va-sway{animation:v-sway 5s ease-in-out infinite;transform-box:fill-box;transform-origin:60px 34px}.va-blink{animation:v-blink 5.5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}.v-thinking-ring{animation:v-spin 4s linear infinite}.v-thinking-dot{animation:v-dot 1.4s ease-in-out infinite}.v-bar-a{transform-origin:bottom;animation:v-barA 2.2s ease-in-out infinite}.v-bar-b{transform-origin:bottom;animation:v-barB 2.2s ease-in-out infinite}.v-eq{animation:v-eq 1s ease-in-out infinite}.v-warning{animation:v-pulse 2.4s ease-in-out infinite}.verda-bubble{animation:v-bubble-in .28s ease-out}.verda-bubble:before{content:"";position:absolute;left:-9px;top:34px;width:16px;height:16px;transform:rotate(45deg);background:var(--habtamu-bubble-bg);border-left:1px solid var(--habtamu-border);border-bottom:1px solid var(--habtamu-border)}.verda-dot{height:6px;width:6px;border-radius:999px;background:#6cc0f2;animation:v-dot 1.1s ease-in-out infinite}
      @keyframes v-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}@keyframes v-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes v-glow{0%,100%{opacity:.5}50%{opacity:.85}}@keyframes v-glow-strong{0%,100%{opacity:.7}50%{opacity:1}}@keyframes v-spin{to{transform:rotate(360deg)}}@keyframes v-blink{0%,90%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}@keyframes v-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}@keyframes v-dot{0%,100%{opacity:.25;transform:translateY(.5px)}50%{opacity:1;transform:translateY(-1px)}}@keyframes v-eq{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}@keyframes v-pulse{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}@keyframes v-barA{0%{transform:scaleY(.35)}55%,100%{transform:scaleY(1)}}@keyframes v-barB{0%{transform:scaleY(.35)}55%,100%{transform:scaleY(.62)}}@keyframes v-bubble-in{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}@media (prefers-reduced-motion: reduce){.verda *,.verda-bubble,.verda-dot{animation:none!important}}
    `}</style>
  );
}
