import { ScriptBlock } from "./ScriptBlock";
import { ResultCards } from "./ResultCards";

interface ToolInvocationProps {
  invocation: {
    toolName: string;
    args: { code?: string; intent?: string };
    state: string;
    result?: unknown;
  };
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.84A1.5 1.5 0 018 2h4a1.5 1.5 0 011.7.84l.94 1.88a1.5 1.5 0 01.36 1.03v11.5a1.5 1.5 0 01-.36 1.03l-.94 1.88A1.5 1.5 0 0112 18H8a1.5 1.5 0 01-1.7-.84l-.94-1.88A1.5 1.5 0 015 14.25V4.75a1.5 1.5 0 01.36-1.03l.94-1.88z" />
    </svg>
  );
}

export function ToolInvocation({ invocation }: ToolInvocationProps) {
  const { toolName, args, state, result } = invocation;
  if (toolName !== "run_gmail_script") return null;

  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900/50 ${
        state === "call" ? "border-l-4 border-l-green-500 animate-pulse" : ""
      } ${state === "result" ? "border-l-4 border-l-green-500/50" : ""}`}
    >
      <div className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-400">
        <PlayIcon />
        <span>{args.intent ?? "Running script..."}</span>
      </div>
      <ScriptBlock code={args.code ?? ""} isStreaming={state === "partial-call"} />
      {state === "partial-call" && (
        <div className="px-4 py-2 text-xs text-neutral-500">Writing script...</div>
      )}
      {state === "call" && (
        <div className="px-4 py-2 text-xs text-green-400">Executing...</div>
      )}
      {state === "result" && result !== undefined && <ResultCards result={result} />}
    </div>
  );
}
