import { Schema, Match } from "effect";
import { ScriptResult } from "../domain/script";
import { EmailCard } from "./EmailCard";

export function ResultCards({ result }: { result: unknown }) {
  const decoded = Schema.decodeUnknownOption(ScriptResult)(result);

  if (decoded._tag === "Some") {
    return Match.valueTags(decoded.value, {
      EmailListResult: ({ emails }) => (
        <div className="space-y-1 px-4 py-2">
          <div className="mb-2 text-xs text-neutral-500">
            {emails.length} email{emails.length !== 1 ? "s" : ""}
          </div>
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} />
          ))}
        </div>
      ),
      ActionResult: ({ action, targetIds, detail }) => (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-green-400">
          <span>
            {action} {targetIds.length} email{targetIds.length !== 1 ? "s" : ""}
          </span>
          {detail != null && <span className="text-neutral-500">-- {detail}</span>}
        </div>
      ),
      RawResult: ({ data }) => (
        <pre className="overflow-x-auto px-4 py-2 font-mono text-xs text-neutral-400">
          {JSON.stringify(data, null, 2)}
        </pre>
      ),
    });
  }

  return (
    <pre className="overflow-x-auto px-4 py-2 font-mono text-xs text-neutral-400">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}
