import { WorkerEntrypoint } from "cloudflare:workers";
import { Gmail } from "inbox.dog";

type GmailBridgeProps = {
  sessionId: string;
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
};

const FALLBACK_ALLOWED_METHODS = [
  "list",
  "get",
  "search",
  "send",
  "labels",
  "profile",
  "archive",
  "markRead",
  "markUnread",
  "trash",
  "untrash",
  "addLabels",
  "removeLabels",
  "createDraft",
  "listDrafts",
  "attachments",
  "attachment",
] as const;

type GmailCtor = { api?: Record<string, unknown> };

/** Derived from Gmail.api — single source of truth. */
const ALLOWED = new Set(
  Object.keys((Gmail as unknown as GmailCtor).api ?? {}).length > 0
    ? Object.keys((Gmail as unknown as GmailCtor).api ?? {})
    : [...FALLBACK_ALLOWED_METHODS]
);

/**
 * WorkerEntrypoint that proxies Gmail API calls from a sandboxed Worker Loader isolate.
 * The sandboxed script calls env.GMAIL.call(method, args), which routes
 * back to this entrypoint in the parent worker via a service binding.
 *
 * ctx.props contains session metadata and OAuth tokens for Gmail initialization.
 */
export class GmailBridge extends WorkerEntrypoint {
  async call(method: string, args: unknown[]): Promise<unknown> {
    const props = this.ctx.props as Partial<GmailBridgeProps>;
    const { access_token, refresh_token, client_id, client_secret } = props;
    if (!access_token || !refresh_token || !client_id || !client_secret) {
      throw new Error("Gmail session not found — please reconnect.");
    }

    const gmail = new Gmail(
      { access_token, refresh_token, client_id, client_secret },
      { baseUrl: "https://inbox.dog", autoRefresh: true }
    );

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
