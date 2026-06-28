import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { useLanguage, type Language } from "@/contexts/LanguageContext";

const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "am", label: "አማርኛ", short: "AM" },
];

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === language)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Select language"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--mfm-border)] bg-transparent px-2.5 text-sm font-medium text-[var(--mfm-text)] transition-colors hover:bg-[var(--mfm-surface-2)]"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{current.short}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[var(--mfm-border)] bg-[var(--mfm-surface)] py-1 shadow-lg">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--mfm-surface-2)] ${
                language === lang.code
                  ? "font-semibold text-[#0070FF]"
                  : "text-[var(--mfm-text)]"
              }`}
            >
              <span className="w-7 font-mono text-xs">{lang.short}</span>
              <span className="text-[var(--mfm-text-2)]">–</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
