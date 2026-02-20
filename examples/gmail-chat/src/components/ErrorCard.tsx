type ErrorPayload = { _tag: string; [key: string]: unknown };

function parseErrorType(error: ErrorPayload): string {
  if (error._tag === "Error" && typeof error.error === "string") {
    return error.error;
  }
  return error._tag;
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function formatError(error: ErrorPayload): { title: string; detail: string; hint: string } {
  const errorType = parseErrorType(error);
  const message = parseString(error.message) ?? "Something went wrong while running your request.";

  if (errorType === "GmailApiError") {
    const statusCode = parseNumber(error.statusCode);
    if (statusCode === 401) {
      return {
        title: "Gmail authentication expired",
        detail: message,
        hint: "Reconnect your Gmail account, then try again.",
      };
    }
    if (statusCode === 403) {
      return {
        title: "Gmail permission denied",
        detail: message,
        hint: "Reconnect with the required Gmail permissions.",
      };
    }
    if (statusCode === 404) {
      return {
        title: "Gmail item not found",
        detail: message,
        hint: "Confirm the email or thread still exists and try again.",
      };
    }
    if (statusCode === 429) {
      return {
        title: "Gmail rate limit reached",
        detail: message,
        hint: "Wait a moment and retry with a narrower request.",
      };
    }
    return {
      title: "Gmail API error",
      detail: message,
      hint: "Try again in a moment. If this keeps happening, reconnect Gmail.",
    };
  }

  if (errorType === "ScriptExecutionError") {
    return {
      title: "Script execution failed",
      detail: message,
      hint: "Try a simpler script or fix the code issue and run again.",
    };
  }

  if (errorType === "SessionExpiredError") {
    return {
      title: "Session expired",
      detail: message,
      hint: "Reconnect your Gmail account to continue.",
    };
  }

  if (errorType === "ScriptTimeoutError") {
    return {
      title: "Script timed out",
      detail: message,
      hint: "Try a smaller query or fewer operations in one request.",
    };
  }

  return {
    title: "Tool error",
    detail: message,
    hint: "Try again with a more specific request.",
  };
}

export function ErrorCard({ error }: { error: ErrorPayload }) {
  const view = formatError(error);
  return (
    <div className="mx-4 my-2 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-base text-red-100">
      <div className="mb-1 font-medium">{view.title}</div>
      <div className="text-red-100/90">{view.detail}</div>
      <div className="mt-2 text-sm text-red-200/90">{view.hint}</div>
    </div>
  );
}
