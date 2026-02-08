/** inbox.dog — Gmail OAuth tokens in 3 API calls */

const DEFAULT_BASE_URL = "https://inbox.dog";

// ── Types ──────────────────────────────────────────────

export type Scope = "email" | "email:read" | "email:send" | "email:full";

export interface CreateKeyResponse {
  client_id: string;
  client_secret: string;
  name: string;
  credits: number;
}

export interface KeyInfo {
  client_id: string;
  name: string;
  credits: number;
  created_at: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  email: string;
}

export interface RefreshResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface InboxDogErrorDetail {
  code: string;
  message: string;
  action?: string;
  docs?: string;
}

// ── Error ──────────────────────────────────────────────

export class InboxDogError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly action?: string;
  public readonly docs?: string;

  constructor(status: number, detail: InboxDogErrorDetail) {
    super(detail.message);
    this.name = "InboxDogError";
    this.code = detail.code;
    this.status = status;
    this.action = detail.action;
    this.docs = detail.docs;
  }
}

// ── Client ─────────────────────────────────────────────

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

  // ── API Keys ───────────────────────────────────────

  /** Create a new API key. Returns client_id, client_secret, and 10 free credits. */
  async createKey(name?: string): Promise<CreateKeyResponse> {
    return this.post<CreateKeyResponse>("/api/keys", { name: name ?? "default" });
  }

  /** Get API key info (credits remaining, creation date). */
  async getKey(clientId: string, clientSecret: string): Promise<KeyInfo> {
    return this.request<KeyInfo>(`/api/keys/${clientId}`, {
      headers: { "X-Client-Secret": clientSecret },
    });
  }

  // ── OAuth ──────────────────────────────────────────

  /**
   * Build the authorization URL to redirect users to.
   * This is a pure URL builder — no network request.
   */
  getAuthUrl(opts: {
    clientId: string;
    redirectUri: string;
    scope?: Scope;
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
    return this.post<TokenResponse>("/oauth/token", {
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
  ): Promise<RefreshResponse> {
    return this.post<RefreshResponse>("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
  }

  // ── Billing ────────────────────────────────────────

  /** Create a Stripe checkout session to purchase credits. */
  async checkout(
    clientId: string,
    clientSecret: string,
    credits?: number,
  ): Promise<CheckoutResponse> {
    return this.post<CheckoutResponse>("/api/checkout", {
      client_id: clientId,
      client_secret: clientSecret,
      credits: credits ?? 100,
    });
  }

  // ── Internal ───────────────────────────────────────

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

    const body = await res.json() as T | { error: InboxDogErrorDetail };

    if (!res.ok) {
      const err = body as { error: InboxDogErrorDetail };
      throw new InboxDogError(res.status, err.error ?? {
        code: "UNKNOWN",
        message: `HTTP ${res.status}`,
      });
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

// ── Convenience export ─────────────────────────────────

/** Create an InboxDog client with default options. */
export function createClient(opts?: InboxDogOptions): InboxDog {
  return new InboxDog(opts);
}

export default InboxDog;
