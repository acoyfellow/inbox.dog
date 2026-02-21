import { Effect, Layer, Schema } from "effect";
import { ScriptExecutor } from "./ScriptExecutor";
import { GmailScriptArgs, ScriptResult, RawResult } from "../domain/script";
import { ScriptExecutionError, ScriptTimeoutError } from "../domain/errors";
// Vite ?raw import — gives us the SDK source as a string to bundle into loader isolates
import GMAIL_SDK_SOURCE from "../../node_modules/inbox.dog/dist/index.js?raw";

type GmailSessionProps = {
  sessionId: string;
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
};

type LoaderEntrypoint = {
  fetch: (request: RequestInfo | URL) => Promise<Response>;
};

type LoaderWorker = {
  getEntrypoint: () => LoaderEntrypoint;
};

type LoaderService = {
  get: (
    id: string,
    init: () => {
      compatibilityDate: string;
      mainModule: string;
      modules: Record<string, string>;
      env: Record<string, unknown>;
    } | Promise<{
      compatibilityDate: string;
      mainModule: string;
      modules: Record<string, string>;
      env: Record<string, unknown>;
    }>,
  ) => LoaderWorker;
};

/**
 * Build the runner module that executes inside the Worker Loader isolate.
 *
 * The isolate has:
 *   - Full network access (no globalOutbound restriction)
 *   - The inbox.dog SDK bundled as "inbox-dog.js"
 *   - OAuth tokens passed via env vars
 *
 * The generated code gets a real `gmail` object backed by the SDK.
 */
function buildRunnerModule(code: string): string {
  return [
    'import { Gmail } from "./inbox-dog.js";',
    "",
    "export default {",
    "  async fetch(request, env) {",
    "    const gmail = new Gmail(",
    "      {",
    "        access_token: env.ACCESS_TOKEN,",
    "        refresh_token: env.REFRESH_TOKEN,",
    "        client_id: env.CLIENT_ID,",
    "        client_secret: env.CLIENT_SECRET,",
    "      },",
    '      { baseUrl: "https://inbox.dog", autoRefresh: true },',
    "    );",
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
) {
  return Layer.succeed(ScriptExecutor, {
    execute: (args: GmailScriptArgs) =>
      Effect.gen(function* () {
        const code =
          typeof args.code === "string"
            ? args.code
            : (args as { code: string }).code;
        const id = `script:${session.sessionId}:${Date.now()}`;

        const run = Effect.tryPromise({
          try: async () => {
            const worker = loaderEnv.LOADER.get(id, () => ({
              compatibilityDate: "2025-06-01",
              mainModule: "runner.js",
              modules: {
                "runner.js": buildRunnerModule(code),
                "inbox-dog.js": GMAIL_SDK_SOURCE as string,
              },
              env: {
                ACCESS_TOKEN: session.access_token,
                REFRESH_TOKEN: session.refresh_token,
                CLIENT_ID: session.client_id,
                CLIENT_SECRET: session.client_secret,
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
          }),
        );

        const decoded = yield* Schema.decodeUnknown(ScriptResult)(result).pipe(
          Effect.catchAll(() => Effect.succeed(new RawResult({ data: result }))),
        );
        return decoded;
      }),
  });
}
