export type AdvisorState = "idle" | "thinking" | "comparing" | "speaking" | "warning" | "recommendation";

type Props = {
  state: AdvisorState;
  message: string;
};

const labels: Record<AdvisorState, string> = {
  idle: "Ready",
  thinking: "Thinking",
  comparing: "Comparing",
  speaking: "Explaining",
  warning: "Risk review",
  recommendation: "Recommendation",
};

export function AIAdvisorAvatar({ state, message }: Props) {
  return (
    <section className={`advisor advisor-${state}`}>
      <div className="avatarWrap" aria-hidden="true">
        <svg className="avatar" viewBox="0 0 120 120" role="img">
          <defs>
            <linearGradient id="visor" x1="0" x2="1">
              <stop offset="0%" stopColor="#5eead4" />
              <stop offset="55%" stopColor="#a7f3d0" />
              <stop offset="100%" stopColor="#facc15" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="46" className="avatar-shell" />
          <rect x="29" y="42" width="62" height="38" rx="18" className="avatar-face" />
          <circle cx="47" cy="61" r="5" className="avatar-eye" />
          <circle cx="73" cy="61" r="5" className="avatar-eye" />
          <path d="M46 74 C54 80 66 80 74 74" className="avatar-mouth" />
          <path d="M20 72 C12 66 12 54 20 48" className="avatar-signal" />
          <path d="M100 48 C108 54 108 66 100 72" className="avatar-signal" />
        </svg>
      </div>
      <div>
        <div className="advisorStatus">{labels[state]}</div>
        <p>{message}</p>
      </div>
    </section>
  );
}
