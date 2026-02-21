import { Effect, Layer } from "effect";
import { ScriptExecutor } from "./ScriptExecutor";
import type { GmailScriptArgs } from "../domain/script";
import { ScriptExecutionError, ScriptTimeoutError } from "../domain/errors";

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
      env: Record<string, string>;
    },
  ) => LoaderWorker;
};

/**
 * Build the runner module for the Worker Loader isolate.
 *
 * The isolate has full network access and an ACCESS_TOKEN env var.
 * Provides gmail.get/post/fetch helpers over the Gmail REST API.
 */
function buildRunnerModule(code: string): string {
  return `
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
let _token = "";

async function gmailFetch(path, opts) {
  const o = opts || {};
  const res = await fetch(BASE + path, {
    method: o.method || "GET",
    body: o.body || undefined,
    headers: {
      "Authorization": "Bearer " + _token,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Gmail API " + res.status + ": " + body);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const gmail = {
  fetch: gmailFetch,
  get: function(path) { return gmailFetch(path); },
  post: function(path, body) {
    return gmailFetch(path, { method: "POST", body: JSON.stringify(body) });
  },
};

export default {
  async fetch(request, env) {
    _token = env.ACCESS_TOKEN;
    try {
      const result = await (async () => {
${code}
      })();
      return Response.json({ ok: true, value: result });
    } catch (err) {
      return Response.json({ ok: false, error: err.message || String(err) });
    }
  }
};
`;
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
              },
              env: {
                ACCESS_TOKEN: session.access_token,
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

        return yield* run.pipe(
          Effect.timeoutFail({
            duration: "30 seconds",
            onTimeout: () => new ScriptTimeoutError({ durationMs: 30_000 }),
          }),
        );
      }),
  });
}
