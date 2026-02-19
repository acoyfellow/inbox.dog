import { Effect, Layer, Schema } from "effect";
import { ScriptExecutor } from "./ScriptExecutor";
import { GmailScriptArgs, ScriptResult, RawResult } from "../domain/script";
import { ScriptExecutionError, ScriptTimeoutError } from "../domain/errors";

type GmailSessionProps = {
  sessionId: string;
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
};

type LoaderWorkerDefinition = {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
  globalOutbound: null;
  env: { GMAIL: unknown };
};

type LoaderEntrypoint = {
  fetch: (request: RequestInfo | URL) => Promise<Response>;
};

type LoaderWorker = {
  getEntrypoint: () => LoaderEntrypoint;
};

type LoaderService = {
  get: (id: string, init: () => LoaderWorkerDefinition | Promise<LoaderWorkerDefinition>) => LoaderWorker;
};

type GmailBridgeFactory = (opts?: { props?: GmailSessionProps }) => unknown;

/**
 * Build an ES module that runs inside a Worker Loader isolate.
 * The code is inlined directly — no `new Function()` needed.
 * `globalOutbound: null` blocks all network; Gmail is proxied via env.GMAIL.
 */
function buildRunnerModule(code: string): string {
  return [
    "export default {",
    "  async fetch(request, env) {",
    "    const gmail = new Proxy({}, {",
    "      get(_, method) {",
    '        if (typeof method !== "string") return undefined;',
    "        return (...args) => env.GMAIL.call(method, args);",
    "      }",
    "    });",
    "    try {",
    "      const result = await (async () => {",
    code,
    "      })();",
    "      return Response.json({ ok: true, value: result });",
    "    } catch (err) {",
    "      return Response.json({ ok: false, error: err.message || String(err) });",
    "    }",
    "  }",
    "};",
  ].join("\n");
}

export function ScriptExecutorLive(
  session: GmailSessionProps,
  loaderEnv: { LOADER: LoaderService },
  ctx: { exports: { GmailBridge: GmailBridgeFactory } },
) {
  return Layer.succeed(ScriptExecutor, {
    execute: (args: GmailScriptArgs) =>
      Effect.gen(function* () {
        const code = typeof args.code === "string" ? args.code : (args as { code: string }).code;
        const id = `script:${session.sessionId}:${Date.now()}`;

        const run = Effect.tryPromise({
          try: async () => {
            const worker = loaderEnv.LOADER.get(id, async () => ({
              compatibilityDate: "2025-06-01",
              mainModule: "runner.js",
              modules: {
                "runner.js": buildRunnerModule(code),
              },
              globalOutbound: null,
              env: {
                GMAIL: ctx.exports.GmailBridge({ props: session }),
              },
            }));

            const entrypoint = worker.getEntrypoint();
            const response = await entrypoint.fetch("http://sandbox/run");
            const result = (await response.json()) as
              | { ok: true; value: unknown }
              | { ok: false; error: string };

            if (!result.ok) {
              throw new Error(result.error);
            }
            return result.value;
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
