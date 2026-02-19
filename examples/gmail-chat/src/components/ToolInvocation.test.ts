import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolInvocation } from "./ToolInvocation";

function render(invocation: {
  type: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
}): string {
  return renderToStaticMarkup(createElement(ToolInvocation, { invocation }));
}

describe("ToolInvocation", () => {
  it("renders input-streaming state", () => {
    const html = render({
      type: "tool-run_gmail_script",
      state: "input-streaming",
      input: { code: "return 1;", intent: "Test" },
    });

    expect(html).toContain("Writing script...");
  });

  it("renders input-available state", () => {
    const html = render({
      type: "tool-run_gmail_script",
      state: "input-available",
      input: { code: "return 1;", intent: "Test" },
    });

    expect(html).toContain("Executing...");
  });

  it("renders output-available state", () => {
    const html = render({
      type: "tool-run_gmail_script",
      state: "output-available",
      input: { code: "return 1;", intent: "Test" },
      output: { _tag: "RawResult", data: { ok: true } },
    });

    expect(html).toContain("ok");
  });

  it("renders output-error state", () => {
    const html = render({
      type: "tool-run_gmail_script",
      state: "output-error",
      input: { code: "throw new Error()", intent: "Break" },
      errorText: "Script failed",
    });

    expect(html).toContain("Script failed");
  });
});
