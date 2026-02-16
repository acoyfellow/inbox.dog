/** inbox.dog — Gmail OAuth tokens in 3 API calls + typed Gmail client */

import { Gmail, type GmailOptions } from "./gmail";
import type { TokenResponse, GmailTokens } from "./types";

const DEFAULT_BASE_URL = "https://inbox.dog";

// Re-export everything
export { Gmail, GmailError, type GmailOptions } from "./gmail";
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
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  // ── API Keys ─────────────────────────────────────────────────────────

  /** Create a new API key. Returns client_id, client_secret, and 10 free credits. */
  async createKey(
    name?: string,
  ): Promise<{
    client_id: string;
    client_secret: string;
    name: string;
    credits: number;
  }> {
    return this.post("/api/keys", { name: name ?? "default" });
  }

  /** Get API key info (credits remaining, creation date). */
  async getKey(
    clientId: string,
    clientSecret: string,
  ): Promise<{ client_id: string; name: string; credits: number; created_at: number }> {
    return this.request(`/api/keys/${clientId}`, {
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

  /** Exchange an authorization code for access + refresh tokens. Costs 1 credit. */
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

  /** Refresh an expired access token. Free, no credit cost. */
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

  // ── Billing ──────────────────────────────────────────────────────────

  /** Create a Stripe checkout session to purchase credits. */
  async checkout(
    clientId: string,
    clientSecret: string,
    credits?: number,
  ): Promise<{ checkout_url: string; session_id: string }> {
    return this.post("/api/checkout", {
      client_id: clientId,
      client_secret: clientSecret,
      credits: credits ?? 100,
    });
  }

  // ── Gmail Client ─────────────────────────────────────────────────────

  /**
   * Create a typed Gmail client from tokens.
   *
   * ```ts
   * const tokens = await dog.exchangeCode(code, clientId, clientSecret)
   * const gmail = dog.gmail(tokens)
   * const unread = await gmail.list({ query: "is:unread" })
   * ```
   *
   * Also accepts raw GmailTokens if you already have an access token:
   *
   * ```ts
   * const gmail = dog.gmail({ access_token: "ya29...." })
   * ```
   */
  gmail(
    tokens: TokenResponse | GmailTokens,
    opts?: Omit<GmailOptions, "fetch" | "baseUrl">,
  ): Gmail {
    const gmailTokens: GmailTokens =
      "email" in tokens
        ? {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          }
        : tokens;

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
