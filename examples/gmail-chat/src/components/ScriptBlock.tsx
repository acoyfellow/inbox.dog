import { Highlight, themes } from "prism-react-renderer";
import { Button } from "@cloudflare/kumo/components/button";

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
      className="h-auto px-1 py-0 text-sm text-neutral-500 hover:text-neutral-300"
    >
      Copy
    </Button>
  );
}

export function ScriptBlock({ code, isStreaming }: ScriptBlockProps) {
  return (
    <div className="border-t border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-1.5 text-sm text-neutral-500">
        <span className="font-mono">gmail-script.js</span>
        {!isStreaming && <CopyButton text={code} />}
      </div>
      <Highlight theme={themes.nightOwl} code={code ?? ""} language="javascript">
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="overflow-x-auto max-w-full px-4 py-2 text-sm leading-5 font-mono"
            style={{ ...style, background: "transparent" }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
