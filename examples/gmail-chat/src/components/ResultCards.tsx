import { Schema, Match } from "effect";
import { ScriptResult } from "../domain/script";
import { EmailCard } from "./EmailCard";
import { ErrorCard } from "./ErrorCard";

type ErrorPayload = { _tag: string; [key: string]: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

function getErrorPayload(value: unknown): ErrorPayload | null {
  if (!isObject(value) || typeof value._tag !== "string") return null;
  if (value._tag === "Error") return value as ErrorPayload;
  if (
    value._tag === "GmailApiError" ||
    value._tag === "ScriptExecutionError" ||
    value._tag === "SessionExpiredError" ||
    value._tag === "ScriptTimeoutError"
  ) {
    return value as ErrorPayload;
  }
  return null;
}

export function ResultCards({ result }: { result: unknown }) {
  const parsedResult = parseResult(result);
  const error = getErrorPayload(parsedResult);
  if (error) {
    return <ErrorCard error={error} />;
  }

  const decoded = Schema.decodeUnknownOption(ScriptResult)(parsedResult);

  if (decoded._tag === "Some") {
    return Match.valueTags(decoded.value, {
      EmailListResult: ({ emails }) => (
        <div className="min-w-0 space-y-1 px-4 py-2">
          <div className="mb-2 text-sm text-neutral-600 dark:text-neutral-500">
            {emails.length} email{emails.length !== 1 ? "s" : ""}
          </div>
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} />
          ))}
        </div>
      ),
      ActionResult: ({ action, targetIds, detail }) => (
        <div className="flex items-center gap-2 px-4 py-2 text-base text-green-600 dark:text-green-400">
          <span>
            {action} {targetIds.length} email{targetIds.length !== 1 ? "s" : ""}
          </span>
          {detail != null && <span className="text-neutral-600 dark:text-neutral-500">-- {detail}</span>}
        </div>
      ),
      RawResult: ({ data }) => (
        <div className="w-full min-w-0 overflow-x-auto">
          <pre className="inline-block min-w-full px-4 py-2 font-mono text-sm text-neutral-700 dark:text-neutral-400 break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ),
    });
  }

  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <pre className="inline-block min-w-full px-4 py-2 font-mono text-sm text-neutral-700 dark:text-neutral-400 break-all">
        {JSON.stringify(parsedResult, null, 2)}
      </pre>
    </div>
  );
}
