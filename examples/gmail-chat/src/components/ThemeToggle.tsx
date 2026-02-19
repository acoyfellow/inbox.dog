import { useSyncExternalStore } from "react";
import { Button } from "@cloudflare/kumo/components/button";

const THEME_CHANGE = "gmail-chat-theme-change";

function subscribe(cb: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onThemeChange = () => cb();
  mql.addEventListener("change", onThemeChange);
  window.addEventListener(THEME_CHANGE, onThemeChange);
  return () => {
    mql.removeEventListener("change", onThemeChange);
    window.removeEventListener(THEME_CHANGE, onThemeChange);
  };
}

function getTheme() {
  return document.documentElement.dataset.theme ?? document.documentElement.dataset.mode ?? "dark";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.mode = next;
    localStorage.setItem("theme", next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE));
  };

  return (
    <Button
      type="button"
      onClick={toggle}
      variant="ghost"
      shape="square"
      size="sm"
      className={`text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 ${className}`}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </Button>
  );
}
