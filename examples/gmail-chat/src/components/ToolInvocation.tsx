import { ScriptBlock } from "./ScriptBlock";
import { ResultCards } from "./ResultCards";

interface ToolInvocationProps {
  invocation: {
    type: string;
    state: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    toolName?: string;
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
  const toolName = invocation.type === "dynamic-tool"
    ? invocation.toolName
    : invocation.type.replace("tool-", "");
  const input = (typeof invocation.input === "object" && invocation.input !== null
    ? invocation.input
    : {}) as { code?: string; intent?: string };
  const { state } = invocation;

  if (toolName !== "run_gmail_script") return null;

  return (
    <div
      className={`rounded-lg border border-neutral-300 bg-neutral-100/80 dark:border-neutral-800 dark:bg-neutral-900/50 min-w-0 overflow-hidden ${
        state === "input-available" ? "border-l-4 border-l-green-500 animate-pulse" : ""
      } ${
        state === "output-available" || state === "output-error"
          ? "border-l-4 border-l-green-500/50"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2 text-base text-neutral-600 dark:text-neutral-400">
        <PlayIcon />
        <span>{input.intent ?? "Running script..."}</span>
      </div>
      <ScriptBlock code={input.code ?? ""} isStreaming={state === "input-streaming"} />
      {state === "input-streaming" && (
        <div className="px-4 py-2 text-sm text-neutral-500 dark:text-neutral-500">Writing script...</div>
      )}
      {state === "input-available" && (
        <div className="px-4 py-2 text-sm text-green-600 dark:text-green-400">Executing...</div>
      )}
      {state === "output-available" && invocation.output !== undefined && (
        <ResultCards result={invocation.output} />
      )}
      {state === "output-error" && (
        <div className="px-4 py-2 text-sm text-red-600 dark:text-red-300">
          {invocation.errorText ?? "Tool execution failed."}
        </div>
      )}
    </div>
  );
}
