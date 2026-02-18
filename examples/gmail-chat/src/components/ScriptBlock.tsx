import { Highlight, themes } from "prism-react-renderer";

interface ScriptBlockProps {
  code: string;
  isStreaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const copy = () => navigator.clipboard.writeText(text);
  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs text-neutral-500 hover:text-neutral-300"
    >
      Copy
    </button>
  );
}

export function ScriptBlock({ code, isStreaming }: ScriptBlockProps) {
  return (
    <div className="border-t border-neutral-800">
      <div className="flex items-center justify-between px-4 py-1.5 text-xs text-neutral-500">
        <span className="font-mono">gmail-script.js</span>
        {!isStreaming && <CopyButton text={code} />}
      </div>
      <Highlight theme={themes.nightOwl} code={code ?? ""} language="javascript">
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="overflow-x-auto px-4 py-2 text-xs leading-5 font-mono"
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
