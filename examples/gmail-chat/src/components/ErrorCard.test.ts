import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorCard } from "./ErrorCard";

function render(error: { _tag: string; [key: string]: unknown }): string {
  return renderToStaticMarkup(createElement(ErrorCard, { error }));
}

describe("ErrorCard", () => {
  it("renders GmailApiError details", () => {
    const html = render({
      _tag: "Error",
      error: "GmailApiError",
      statusCode: 401,
      message: "Unauthorized",
    });

    expect(html).toContain("Gmail authentication expired");
    expect(html).toContain("Reconnect your Gmail account");
  });

  it("renders ScriptExecutionError details", () => {
    const html = render({
      _tag: "Error",
      error: "ScriptExecutionError",
      message: "ReferenceError: gmail is undefined",
    });

    expect(html).toContain("Script execution failed");
    expect(html).toContain("Try a simpler script");
  });

  it("renders SessionExpiredError details", () => {
    const html = render({
      _tag: "Error",
      error: "SessionExpiredError",
      message: "Session expired",
    });

    expect(html).toContain("Session expired");
    expect(html).toContain("Reconnect your Gmail account");
  });

  it("renders ScriptTimeoutError details", () => {
    const html = render({
      _tag: "Error",
      error: "ScriptTimeoutError",
      durationMs: 30000,
      message: "Timed out",
    });

    expect(html).toContain("Script timed out");
    expect(html).toContain("smaller query");
  });
});
