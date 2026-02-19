import { WorkerEntrypoint } from "cloudflare:workers";
import { Gmail } from "inbox.dog";

/**
 * In-memory registry of Gmail client instances.
 * Keyed by session ID so the bridge can look them up
 * without needing to serialize the Gmail object across isolates.
 */
const sessions = new Map<string, Gmail>();

export function registerGmail(sessionId: string, gmail: Gmail): void {
  sessions.set(sessionId, gmail);
}

export function unregisterGmail(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Derived from Gmail.api — single source of truth. */
const ALLOWED = new Set(Object.keys(Gmail.api));

/**
 * WorkerEntrypoint that proxies Gmail API calls from a sandboxed Worker Loader isolate.
 * The sandboxed script calls env.GMAIL.call(method, args), which routes
 * back to this entrypoint in the parent worker via a service binding.
 *
 * ctx.props.sessionId identifies which Gmail client to use.
 */
export class GmailBridge extends WorkerEntrypoint {
  async call(method: string, args: unknown[]): Promise<unknown> {
    const sessionId = (this.ctx.props as { sessionId: string }).sessionId;
    const gmail = sessions.get(sessionId);
    if (!gmail) {
      throw new Error("Gmail session not found — please reconnect.");
    }
    if (!ALLOWED.has(method)) {
      throw new Error(`Method not allowed: ${method}`);
    }
    const g = gmail as unknown as Record<string, (...a: unknown[]) => unknown>;
    const fn = g[method];
    if (typeof fn !== "function") {
      throw new Error(`Unknown method: ${method}`);
    }
    return fn.apply(gmail, args);
  }
}
