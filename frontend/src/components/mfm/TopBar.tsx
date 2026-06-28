import { Download, Moon, Sun } from "lucide-react";
import type { Theme } from "@/hooks/useTheme";
import { LanguageSelector } from "./LanguageSelector";

export type TabId = "map" | "ranking" | "compare";

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  onExport: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "ranking", label: "Ranking" },
  { id: "compare", label: "Compare" },
];

export function TopBar({ tab, onTab, onExport, theme, onToggleTheme }: Props) {
  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--mfm-border)] bg-[var(--mfm-surface)] px-4"
      style={{ height: "56px", flexShrink: 0 }}
    >
      <div className="flex items-center gap-3">
        <img
          src="https://www.menschenfuermenschen.de/tcl-uploads/2025/02/MfM-Logo_Blau_Vertical_RGB-_logosvg.svg"
          alt="Menschen für Menschen"
          className="h-8 w-8 rounded-md object-contain"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-[var(--mfm-text)]">MFMTree</span>
          <span className="hidden text-[10px] uppercase tracking-wider text-[var(--mfm-text-2)] md:inline">
            Menschen für Menschen · Reforestation Priority
          </span>
        </div>
      </div>
      <nav className="flex items-center gap-1 rounded-full border border-[var(--mfm-border)] bg-[var(--mfm-bg)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-[#0070FF] text-white shadow"
                : "text-[var(--mfm-text-2)] hover:text-[var(--mfm-text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <LanguageSelector />
        <button
          onClick={onToggleTheme}
          aria-label="Toggle light/dark mode"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--mfm-border)] bg-transparent text-[var(--mfm-text)] transition-colors hover:bg-[var(--mfm-surface-2)]"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-2 rounded-lg border border-[var(--mfm-border)] bg-transparent px-3 py-1.5 text-sm text-[var(--mfm-text)] transition-colors hover:bg-[var(--mfm-surface-2)]"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>
    </header>
  );
}
