import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "mfm-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // ignore
    }
    return "dark"; // default: satellite basemap
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-mfm-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return {
    theme,
    setTheme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
