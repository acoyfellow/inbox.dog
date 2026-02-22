import { useSyncExternalStore } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Button } from "@cloudflare/kumo/components/button";

const THEME_CHANGE = "gmail-chat-theme-change";

function subscribeTheme(cb: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", cb);
  window.addEventListener(THEME_CHANGE, cb);
  return () => {
    mql.removeEventListener("change", cb);
    window.removeEventListener(THEME_CHANGE, cb);
  };
}

function getTheme() {
  return document.documentElement?.dataset?.theme ?? document.documentElement?.dataset?.mode ?? "dark";
}

interface ScriptBlockProps {
  code: string;
  isStreaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const copy = () => navigator.clipboard.writeText(text);
  return (
    <Button
      type="button"
      onClick={copy}
      variant="ghost"
      size="xs"
      className="h-auto px-1 py-0 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
    >
      Copy
    </Button>
  );
}

export function ScriptBlock({ code, isStreaming }: ScriptBlockProps) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
  const prismTheme = theme === "light" ? themes.github : themes.nightOwl;
  return (
    <div className="script-block w-full max-w-full min-w-0 border-t border-neutral-300 dark:border-neutral-800">
      <div className="flex min-w-0 items-center justify-between gap-2 px-4 py-1.5 text-sm text-neutral-600 dark:text-neutral-500">
        <span className="font-mono truncate">gmail-script.js</span>
        {!isStreaming && <CopyButton text={code} />}
      </div>
      <div className="max-h-80 w-full min-w-0 overflow-auto">
        <Highlight theme={prismTheme} code={code ?? ""} language="javascript">
          {({ tokens, getLineProps, getTokenProps }) => {
            const wrapStyle = { whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const };
            return (
              <pre
                className="max-w-full px-4 py-2 text-sm leading-5 font-mono"
                style={{ background: "transparent", ...wrapStyle }}
              >
                {tokens.map((line, i) => {
                  const lineProps = getLineProps({ line });
                  return (
                    <div key={i} {...lineProps} style={{ ...lineProps.style, ...wrapStyle }}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  );
                })}
              </pre>
            );
          }}
        </Highlight>
      </div>
    </div>
  );
}
