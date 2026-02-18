import { Effect, Layer, Schema } from "effect";
import type { Gmail } from "inbox.dog";
import { ScriptExecutor } from "./ScriptExecutor";
import {
  GmailScriptArgs,
  ScriptResult,
  RawResult,
} from "../domain/script";
import { ScriptExecutionError, ScriptTimeoutError } from "../domain/errors";

const ALLOWED = ["list", "get", "search", "send", "labels", "archive", "markRead", "markUnread", "trash", "addLabels", "removeLabels"] as const;

function buildSandbox(gmail: Gmail): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {};
  const g = gmail as unknown as Record<string, unknown>;
  for (const k of ALLOWED) {
    const fn = g[k];
    if (typeof fn === "function") {
      sandbox[k] = fn.bind(gmail);
    }
  }
  return sandbox;
}

export function ScriptExecutorLive(gmail: Gmail) {
  const sandbox = buildSandbox(gmail);
  return Layer.succeed(ScriptExecutor, {
    execute: (args: GmailScriptArgs) =>
      Effect.gen(function* () {
        const code = typeof args.code === "string" ? args.code : (args as { code: string }).code;
        const run = Effect.tryPromise({
          try: () => {
            const fn = new Function("gmail", `return (async () => { ${code} })();`);
            return fn(sandbox) as Promise<unknown>;
          },
          catch: (err) =>
            new ScriptExecutionError({
              message: err instanceof Error ? err.message : String(err),
              code,
            }),
        });
        const result = yield* run.pipe(
          Effect.timeoutFail({
            duration: "30 seconds",
            onTimeout: () => new ScriptTimeoutError({ durationMs: 30_000 }),
          })
        );
        const decoded = yield* Schema.decodeUnknown(ScriptResult)(result).pipe(
          Effect.catchAll(() => Effect.succeed(new RawResult({ data: result })))
        );
        return decoded;
      }),
  });
}
