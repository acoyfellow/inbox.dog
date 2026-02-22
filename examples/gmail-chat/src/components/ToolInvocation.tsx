import { useEffect } from "react";
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

function toolErrorDisplay(invocation: ToolInvocationProps["invocation"]): string {
  if (invocation.errorText) return invocation.errorText;
  const out = invocation.output;
  if (typeof out === "string") return out;
  if (out && typeof out === "object" && "message" in out && typeof (out as { message: unknown }).message === "string")
    return (out as { message: string }).message;
  if (out && typeof out === "object" && "error" in out && typeof (out as { error: unknown }).error === "string")
    return (out as { error: string }).error;
  return "Tool execution failed.";
}

function PlayIcon() {
  return (
    <svg 
      version="1.1" 
      id="Layer_1" 
      xmlns="http://www.w3.org/2000/svg" 
      xmlnsXlink="http://www.w3.org/1999/xlink" 
      x="0px" 
      y="0px"
      viewBox="0 0 330 330" 
      className="h-3 w-3" fill="currentColor" 
      style={{ enableBackground: "new 0 0 330 330" } as React.CSSProperties} xmlSpace="preserve">
        <path id="XMLID_308_" d="M37.728,328.12c2.266,1.256,4.77,1.88,7.272,1.88c2.763,0,5.522-0.763,7.95-2.28l240-149.999
      c4.386-2.741,7.05-7.548,7.05-12.72c0-5.172-2.664-9.979-7.05-12.72L52.95,2.28c-4.625-2.891-10.453-3.043-15.222-0.4
      C32.959,4.524,30,9.547,30,15v300C30,320.453,32.959,325.476,37.728,328.12z"/>
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

  // Support both legacy run_gmail_script and current codemode tool
  const isCodeTool = toolName === "run_gmail_script" || toolName === "codemode";
  if (!isCodeTool) return null;

  // Codemode output is { code, result, logs? }; show result in ResultCards
  const output = invocation.output as { result?: unknown } | undefined;
  const result = output?.result ?? invocation.output;
  const displayIntent = input.intent ?? (toolName === "codemode" ? "Running code..." : "Running script...");

  useEffect(() => {
    if (state === "output-error") {
      console.error("[gmail-chat] tool error", { state, errorText: invocation.errorText, output: invocation.output, invocation });
    }
  }, [state, invocation]);

  // Show only the executable code; input may be string or { code } or JSON-wrapped
  let displayCode = typeof invocation.input === "string" ? invocation.input : (input.code ?? "");
  if (typeof displayCode === "string" && displayCode.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(displayCode) as { code?: string };
      if (typeof parsed?.code === "string") displayCode = parsed.code;
    } catch {
      // keep displayCode as-is
    }
  }

  return (
    <div
      className={`rounded-lg border border-neutral-300 bg-neutral-100/80 dark:border-neutral-800 dark:bg-neutral-900/50 w-full min-w-0 max-w-full overflow-hidden ${
        state === "input-available" ? "border-l-4 border-l-green-500 animate-pulse" : ""
      } ${
        state === "output-available" || state === "output-error"
          ? "border-l-4 border-l-green-500/50"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2 text-base text-neutral-600 dark:text-neutral-400">
        <PlayIcon />
        <span>{displayIntent}</span>
      </div>
      <ScriptBlock code={displayCode} isStreaming={state === "input-streaming"} />
      {state === "input-streaming" && (
        <div className="px-4 py-2 text-sm text-neutral-500 dark:text-neutral-500">Writing script...</div>
      )}
      {state === "input-available" && (
        <div className="px-4 py-2 text-sm text-green-600 dark:text-green-400">Executing...</div>
      )}
      {state === "output-available" && result !== undefined && (
        <ResultCards result={result} />
      )}
      {state === "output-error" && (
        <div className="px-4 py-2 text-sm text-red-600 dark:text-red-300">
          {toolErrorDisplay(invocation)}
          <div className="mt-1 text-xs opacity-80">Check browser console for full error details.</div>
        </div>
      )}
    </div>
  );
}
