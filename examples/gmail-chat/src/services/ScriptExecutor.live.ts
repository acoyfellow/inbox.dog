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

/**
 * Build the runner module for the Worker Loader isolate.
 *
 * The token is baked directly into the module source because Worker Loader
 * `env` passing may not work reliably from Durable Object contexts.
 * The isolate has full network access (globalOutbound is not set).
 * Provides gmail.get/post/fetch helpers over the Gmail REST API.
 */
function buildRunnerModule(code: string, accessToken: string): string {
  // Escape the token for safe embedding in a JS string literal
  const safeToken = accessToken.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  return `
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const ACCESS_TOKEN = '${safeToken}';

async function gmailFetch(path, opts) {
  const o = opts || {};
  const res = await fetch(BASE + path, {
    method: o.method || "GET",
    body: o.body || undefined,
    headers: {
      "Authorization": "Bearer " + ACCESS_TOKEN,
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

// Also expose as env.ACCESS_TOKEN for LLM code that tries to use it directly
const env = { ACCESS_TOKEN };

export default {
  async fetch(request) {
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
  loaderEnv: { LOADER: { get: (id: string, init: () => unknown) => { getEntrypoint: () => { fetch: (req: RequestInfo | URL) => Promise<Response> } } } },
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
                "runner.js": buildRunnerModule(code, session.access_token),
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
