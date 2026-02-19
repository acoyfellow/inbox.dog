/** inbox.dog — Gmail OAuth tokens in 3 API calls + typed Gmail client */

import { Gmail, type GmailOptions } from "./gmail";
import type { TokenResponse, DeviceCodeResponse, GmailTokens } from "./types";

const DEFAULT_BASE_URL = "https://inbox.dog";

// Re-export everything
export { Gmail, GmailError, type GmailOptions, type MethodDoc } from "./gmail";
export * from "./types";

// ── Error ────────────────────────────────────────────────────────────────

export class InboxDogError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly action?: string;
  public readonly docs?: string;

  constructor(
    status: number,
    detail: { code: string; message: string; action?: string; docs?: string },
  ) {
    super(detail.message);
    this.name = "InboxDogError";
    this.code = detail.code;
    this.status = status;
    this.action = detail.action;
    this.docs = detail.docs;
  }
}

// ── Client ───────────────────────────────────────────────────────────────

export interface InboxDogOptions {
  /** Override the base URL (default: https://inbox.dog) */
  baseUrl?: string;
  /** Provide a custom fetch implementation */
  fetch?: typeof globalThis.fetch;
}

export class InboxDog {
  private baseUrl: string;
  private fetchFn: typeof globalThis.fetch;

  constructor(opts: InboxDogOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    // Wrap so fetch is never stored by reference (Cloudflare Workers "Illegal invocation" otherwise)
    this.fetchFn = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  }

  // ── API Keys ─────────────────────────────────────────────────────────

  /** Create a new API key. Returns client_id and client_secret. */
  async createKey(
    name?: string,
  ): Promise<{
    client_id: string;
    client_secret: string;
    name: string;
    credits?: number;
    redirect_uris?: string[];
  }> {
    return this.post("/api/keys", { name: name ?? "default" });
  }

  /** Get API key info (creation date). */
  async getKey(
    clientId: string,
    clientSecret: string,
  ): Promise<{ client_id: string; name: string; credits?: number; created_at: number }> {
    return this.request(`/api/keys/${clientId}`, {
      headers: { "X-Client-Secret": clientSecret },
    });
  }

  /**
   * Fetch Gmail tokens for a web-bound key. Use after Connect Gmail at inbox.dog/connect.
   * Requires only client_id + client_secret — no OAuth flow in your app.
   */
  async getTokens(
    clientId: string,
    clientSecret: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
    email: string;
  }> {
    return this.request(this.baseUrl + "/api/tokens?client_id=" + encodeURIComponent(clientId), {
      headers: { "X-Client-Secret": clientSecret },
    });
  }

  // ── OAuth ────────────────────────────────────────────────────────────

  /**
   * Build the authorization URL to redirect users to.
   * Pure URL builder — no network request.
   */
  getAuthUrl(opts: {
    clientId: string;
    redirectUri: string;
    scope?: "email" | "email:read" | "email:send" | "email:full";
    state?: string;
  }): string {
    const url = new URL(`${this.baseUrl}/oauth/authorize`);
    url.searchParams.set("client_id", opts.clientId);
    url.searchParams.set("redirect_uri", opts.redirectUri);
    if (opts.scope) url.searchParams.set("scope", opts.scope);
    if (opts.state) url.searchParams.set("state", opts.state);
    return url.toString();
  }

  /** Exchange an authorization code for access + refresh tokens. */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenResponse> {
    return this.post("/oauth/token", {
      code,
      client_id: clientId,
      client_secret: clientSecret,
    });
  }

  /** Refresh an expired access token. */
  async refreshToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ access_token: string; token_type: "Bearer"; expires_in: number }> {
    return this.post("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
  }

  // ── Device Auth (CLI / Agent flow) ─────────────────────────────────

  /**
   * Start a device-code auth flow for CLIs and agents that can't host a callback server.
   * Returns an auth URL that the user should open in a browser.
   *
   * After the user authenticates, they'll see a code on inbox.dog's hosted page.
   * Use `exchangeCode()` with that code to get tokens.
   *
   * ```ts
   * const { auth_url } = await dog.getDeviceCode(clientId, clientSecret, "email:full");
   * console.log(`Open: ${auth_url}`);
   * const code = await prompt("Paste code: ");
   * const tokens = await dog.exchangeCode(code, clientId, clientSecret);
   * ```
   */
  async getDeviceCode(
    clientId: string,
    clientSecret: string,
    scope?: "email" | "email:read" | "email:send" | "email:full",
  ): Promise<DeviceCodeResponse> {
    return this.post("/api/device/code", {
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope ?? "email",
    });
  }

  // ── Gmail Client ─────────────────────────────────────────────────────

  /**
   * Gmail client from API key only. Use after Connect Gmail at inbox.dog/connect.
   * Fetches tokens from hosted inbox.dog — no OAuth, no token env vars.
   */
  async gmailFromKey(
    clientId: string,
    clientSecret: string,
  ): Promise<Gmail> {
    const tokens = await this.getTokens(clientId, clientSecret);
    return this.gmail(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      },
      clientId,
      clientSecret,
    );
  }

  /**
   * Create a typed Gmail client from tokens.
   *
   * Pass `clientId` and `clientSecret` to enable automatic token refresh:
   *
   * ```ts
   * const tokens = await dog.exchangeCode(code, clientId, clientSecret)
   * const gmail = dog.gmail(tokens, clientId, clientSecret)
   * const unread = await gmail.list({ query: "is:unread" })
   * ```
   *
   * Or use gmailFromKey() after Connect Gmail — no tokens needed.
   */
  gmail(
    tokens: TokenResponse | GmailTokens,
    clientIdOrOpts?: string | Omit<GmailOptions, "fetch" | "baseUrl">,
    clientSecret?: string,
  ): Gmail {
    // Parse overloaded args: gmail(tokens, clientId, clientSecret) or gmail(tokens, opts)
    const opts = typeof clientIdOrOpts === "object" ? clientIdOrOpts : undefined;
    const credClientId = typeof clientIdOrOpts === "string" ? clientIdOrOpts : undefined;
    const credClientSecret = clientSecret;

    const gmailTokens: GmailTokens =
      "email" in tokens
        ? {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            client_id: credClientId,
            client_secret: credClientSecret,
          }
        : {
            ...tokens,
            // Forward credentials if provided and not already on the tokens
            client_id: tokens.client_id ?? credClientId,
            client_secret: tokens.client_secret ?? credClientSecret,
          };

    return new Gmail(gmailTokens, {
      ...opts,
      fetch: this.fetchFn,
      baseUrl: this.baseUrl,
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const body = (await res.json()) as
      | T
      | { error: { code: string; message: string; action?: string; docs?: string } };

    if (!res.ok) {
      const err = body as {
        error: { code: string; message: string; action?: string; docs?: string };
      };
      throw new InboxDogError(
        res.status,
        err.error ?? { code: "UNKNOWN", message: `HTTP ${res.status}` },
      );
    }

    return body as T;
  }

  private async post<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

// ── Convenience export ───────────────────────────────────────────────────

/** Create an InboxDog client with default options. */
export function createClient(opts?: InboxDogOptions): InboxDog {
  return new InboxDog(opts);
}

export default InboxDog;
