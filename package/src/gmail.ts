import type {
  GmailTokens,
  Email,
  EmailSummary,
  EmailListResult,
  SendOptions,
  SendResult,
  GmailProfile,
  Label,
  Attachment,
  AttachmentData,
  Draft,
  DraftOptions,
  BatchModifyOptions,
  GmailRawMessage,
  GmailMessagePart,
  GmailListResponse,
  GmailLabelResponse,
  GmailDraftResponse,
  GmailDraftListResponse,
} from "./types";

export interface GmailOptions {
  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch;
  /** inbox.dog base URL for token refresh (default: https://inbox.dog) */
  baseUrl?: string;
  /** Auto-refresh tokens when expired (default: true if refresh_token + client credentials provided) */
  autoRefresh?: boolean;
}

export class GmailError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(status: number, body: unknown) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as Record<string, unknown>).error)
        : `Gmail API error: ${status}`;
    super(msg);
    this.name = "GmailError";
    this.status = status;
    this.body = body;
  }
}

export interface MethodDoc {
  signature: string;
  description: string;
  returns: string;
}

export class Gmail {
  /** Structured API metadata — single source of truth for LLM prompts and allowlists. */
  static readonly api: Record<string, MethodDoc> = {
    list: {
      signature: "(opts?: { query?: string, max?: number, labelIds?: string[], pageToken?: string })",
      description: "List emails matching a query. max defaults to 10, capped at 100.",
      returns: "{ messages: EmailSummary[], total: number, nextPageToken?: string }",
    },
    get: {
      signature: "(id: string)",
      description: "Get full email content by ID including decoded body.",
      returns: "{ id, threadId, from, to, cc, bcc, subject, date, snippet, body, labelIds }",
    },
    search: {
      signature: "(query: string, opts?: { max?: number, pageToken?: string })",
      description: "Search emails. Shorthand for list({ query, ...opts }).",
      returns: "{ messages: EmailSummary[], total: number, nextPageToken?: string }",
    },
    send: {
      signature: "(opts: { to: string | string[], subject: string, body: string, cc?: string | string[], bcc?: string | string[], replyTo?: string, threadId?: string })",
      description: "Send an email.",
      returns: "{ id: string, threadId: string }",
    },
    labels: {
      signature: "()",
      description: "List all labels (system and user-created).",
      returns: "{ id, name, type: 'system' | 'user', messagesTotal?, messagesUnread? }[]",
    },
    profile: {
      signature: "()",
      description: "Get authenticated user's Gmail profile.",
      returns: "{ emailAddress, messagesTotal, threadsTotal, historyId }",
    },
    archive: {
      signature: "(ids: string | string[])",
      description: "Archive messages (remove INBOX label).",
      returns: "void",
    },
    markRead: {
      signature: "(ids: string | string[])",
      description: "Mark messages as read.",
      returns: "void",
    },
    markUnread: {
      signature: "(ids: string | string[])",
      description: "Mark messages as unread.",
      returns: "void",
    },
    trash: {
      signature: "(ids: string | string[])",
      description: "Move messages to trash.",
      returns: "void",
    },
    untrash: {
      signature: "(ids: string | string[])",
      description: "Restore messages from trash.",
      returns: "void",
    },
    addLabels: {
      signature: "(ids: string | string[], labelIds: string[])",
      description: "Add labels to messages.",
      returns: "void",
    },
    removeLabels: {
      signature: "(ids: string | string[], labelIds: string[])",
      description: "Remove labels from messages.",
      returns: "void",
    },
    createDraft: {
      signature: "(opts: { to: string | string[], subject: string, body: string, cc?: string | string[], bcc?: string | string[], threadId?: string })",
      description: "Create a draft.",
      returns: "{ id: string, message: EmailSummary }",
    },
    listDrafts: {
      signature: "(opts?: { max?: number })",
      description: "List drafts. max defaults to 10, capped at 100.",
      returns: "{ id: string, message: EmailSummary }[]",
    },
    attachments: {
      signature: "(messageId: string)",
      description: "List attachments on a message (metadata only).",
      returns: "{ id, filename, mimeType, size }[]",
    },
    attachment: {
      signature: "(messageId: string, attachmentId: string)",
      description: "Download attachment binary data.",
      returns: "{ id, filename, mimeType, size, data: Uint8Array }",
    },
  };

  /** Format API metadata as an LLM-friendly reference string. */
  static describe(): string {
    const lines = Object.entries(Gmail.api).map(
      ([name, m]) => `gmail.${name}${m.signature} → ${m.returns}\n  ${m.description}`,
    );
    return [
      "## Gmail API",
      "",
      ...lines,
      "",
      "## Types",
      "EmailSummary: { id, threadId, from, subject, date, snippet, labelIds }",
      "Email: EmailSummary + { to, cc, bcc, body }",
    ].join("\n");
  }

  private tokens: GmailTokens;
  private fetchFn: typeof globalThis.fetch;
  private baseUrl: string;
  private autoRefresh: boolean;
  private expiresAt: number | null = null;

  constructor(tokens: GmailTokens, opts: GmailOptions = {}) {
    this.tokens = { ...tokens };
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = (opts.baseUrl ?? "https://inbox.dog").replace(/\/+$/, "");
    this.autoRefresh =
      opts.autoRefresh ??
      !!(tokens.refresh_token && tokens.client_id && tokens.client_secret);
  }

  // ── Core ──────────────────────────────────────────────────────────────

  /**
   * List emails matching a query.
   *
   * ```ts
   * const result = await gmail.list({ query: "is:unread", max: 5 })
   * ```
   */
  async list(
    opts: {
      query?: string;
      max?: number;
      labelIds?: string[];
      pageToken?: string;
    } = {},
  ): Promise<EmailListResult> {
    const max = Math.min(opts.max ?? 10, 100);
    const params = new URLSearchParams({ maxResults: String(max) });
    if (opts.query) params.set("q", opts.query);
    if (opts.pageToken) params.set("pageToken", opts.pageToken);
    if (opts.labelIds) {
      for (const l of opts.labelIds) params.append("labelIds", l);
    }

    const list = (await this.gmailFetch(
      `/messages?${params.toString()}`,
    )) as GmailListResponse;

    if (!list.messages || list.messages.length === 0) {
      return { messages: [], total: 0 };
    }

    const summaries = await Promise.all(
      list.messages.slice(0, max).map(async (m) => {
        const msg = (await this.gmailFetch(
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        )) as GmailRawMessage;
        return this.toSummary(msg);
      }),
    );

    return {
      messages: summaries,
      total: list.resultSizeEstimate ?? summaries.length,
      nextPageToken: list.nextPageToken,
    };
  }

  /**
   * Get full email content by ID.
   *
   * ```ts
   * const email = await gmail.get("msg_abc123")
   * console.log(email.from, email.subject, email.body)
   * ```
   */
  async get(id: string): Promise<Email> {
    const msg = (await this.gmailFetch(
      `/messages/${encodeURIComponent(id)}?format=full`,
    )) as GmailRawMessage;

    return {
      id: msg.id,
      threadId: msg.threadId ?? "",
      from: this.getHeader(msg, "From"),
      to: this.getHeader(msg, "To"),
      cc: this.getHeader(msg, "Cc"),
      bcc: this.getHeader(msg, "Bcc"),
      subject: this.getHeader(msg, "Subject"),
      date: this.getHeader(msg, "Date"),
      snippet: msg.snippet ?? "",
      body: msg.payload ? this.extractBody(msg.payload) : "",
      labelIds: msg.labelIds ?? [],
    };
  }

  /**
   * Send an email.
   *
   * ```ts
   * await gmail.send({
   *   to: "alice@example.com",
   *   subject: "hello",
   *   body: "no MIME encoding needed",
   * })
   * ```
   */
  async send(opts: SendOptions): Promise<SendResult> {
    const raw = this.buildMimeMessage(opts);
    const encoded = this.encodeBase64Url(raw);

    const payload: Record<string, string> = { raw: encoded };
    if (opts.threadId) payload.threadId = opts.threadId;

    const res = (await this.gmailFetch("/messages/send", {
      method: "POST",
      body: JSON.stringify(payload),
    })) as { id: string; threadId: string };

    return { id: res.id, threadId: res.threadId };
  }

  /**
   * Search emails. Shorthand for `list({ query })`.
   *
   * ```ts
   * const invoices = await gmail.search("subject:invoice has:attachment")
   * ```
   */
  async search(
    query: string,
    opts: { max?: number; pageToken?: string } = {},
  ): Promise<EmailListResult> {
    return this.list({ query, ...opts });
  }

  // ── Labels ────────────────────────────────────────────────────────────

  /** List all labels. */
  async labels(): Promise<Label[]> {
    const res = (await this.gmailFetch("/labels")) as GmailLabelResponse;
    return (res.labels ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type as "system" | "user",
      messagesTotal: l.messagesTotal,
      messagesUnread: l.messagesUnread,
    }));
  }

  /** Add labels to messages. */
  async addLabels(
    ids: string | string[],
    labelIds: string[],
  ): Promise<void> {
    await this.batchModify({
      ids: Array.isArray(ids) ? ids : [ids],
      addLabelIds: labelIds,
    });
  }

  /** Remove labels from messages. */
  async removeLabels(
    ids: string | string[],
    labelIds: string[],
  ): Promise<void> {
    await this.batchModify({
      ids: Array.isArray(ids) ? ids : [ids],
      removeLabelIds: labelIds,
    });
  }

  // ── Convenience ───────────────────────────────────────────────────────

  /** Archive messages (remove INBOX label). */
  async archive(ids: string | string[]): Promise<void> {
    await this.removeLabels(ids, ["INBOX"]);
  }

  /** Mark messages as read. */
  async markRead(ids: string | string[]): Promise<void> {
    await this.removeLabels(ids, ["UNREAD"]);
  }

  /** Mark messages as unread. */
  async markUnread(ids: string | string[]): Promise<void> {
    await this.addLabels(ids, ["UNREAD"]);
  }

  /** Trash a message. */
  async trash(ids: string | string[]): Promise<void> {
    const arr = Array.isArray(ids) ? ids : [ids];
    await Promise.all(
      arr.map((id) =>
        this.gmailFetch(`/messages/${encodeURIComponent(id)}/trash`, {
          method: "POST",
        }),
      ),
    );
  }

  /** Untrash a message. */
  async untrash(ids: string | string[]): Promise<void> {
    const arr = Array.isArray(ids) ? ids : [ids];
    await Promise.all(
      arr.map((id) =>
        this.gmailFetch(`/messages/${encodeURIComponent(id)}/untrash`, {
          method: "POST",
        }),
      ),
    );
  }

  // ── Drafts ────────────────────────────────────────────────────────────

  /** Create a draft. */
  async createDraft(opts: DraftOptions): Promise<Draft> {
    const raw = this.buildMimeMessage(opts);
    const encoded = this.encodeBase64Url(raw);

    const payload: Record<string, unknown> = {
      message: { raw: encoded },
    };
    if (opts.threadId) payload.message = { raw: encoded, threadId: opts.threadId };

    const res = (await this.gmailFetch("/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    })) as GmailDraftResponse;

    return {
      id: res.id,
      message: this.toSummary(res.message),
    };
  }

  /** List drafts. */
  async listDrafts(opts: { max?: number } = {}): Promise<Draft[]> {
    const max = Math.min(opts.max ?? 10, 100);
    const params = new URLSearchParams({ maxResults: String(max) });

    const res = (await this.gmailFetch(
      `/drafts?${params.toString()}`,
    )) as GmailDraftListResponse;

    if (!res.drafts || res.drafts.length === 0) return [];

    return res.drafts.map((d) => ({
      id: d.id,
      message: this.toSummary(d.message),
    }));
  }

  // ── Attachments ───────────────────────────────────────────────────────

  /** List attachments on a message. */
  async attachments(messageId: string): Promise<Attachment[]> {
    const msg = (await this.gmailFetch(
      `/messages/${encodeURIComponent(messageId)}?format=full`,
    )) as GmailRawMessage;

    return this.extractAttachments(msg.payload);
  }

  /** Download attachment data. */
  async attachment(
    messageId: string,
    attachmentId: string,
  ): Promise<AttachmentData> {
    // First get attachment metadata from the message
    const atts = await this.attachments(messageId);
    const meta = atts.find((a) => a.id === attachmentId);

    // Download the attachment data
    const res = (await this.gmailFetch(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    )) as { data: string; size: number };

    const bytes = this.decodeBase64UrlToBytes(res.data);

    return {
      id: attachmentId,
      filename: meta?.filename ?? "attachment",
      mimeType: meta?.mimeType ?? "application/octet-stream",
      size: res.size,
      data: bytes,
    };
  }

  // ── Profile ───────────────────────────────────────────────────────────

  /** Get authenticated user's Gmail profile. */
  async profile(): Promise<GmailProfile> {
    return (await this.gmailFetch("/profile")) as GmailProfile;
  }

  // ── Batch ─────────────────────────────────────────────────────────────

  /** Batch modify labels on multiple messages. */
  async batchModify(opts: BatchModifyOptions): Promise<void> {
    if (opts.ids.length === 0) return;

    // Single message: use modify endpoint
    if (opts.ids.length === 1) {
      await this.gmailFetch(
        `/messages/${encodeURIComponent(opts.ids[0])}/modify`,
        {
          method: "POST",
          body: JSON.stringify({
            addLabelIds: opts.addLabelIds ?? [],
            removeLabelIds: opts.removeLabelIds ?? [],
          }),
        },
      );
      return;
    }

    // Multiple messages: use batchModify endpoint
    await this.gmailFetch("/messages/batchModify", {
      method: "POST",
      body: JSON.stringify({
        ids: opts.ids,
        addLabelIds: opts.addLabelIds ?? [],
        removeLabelIds: opts.removeLabelIds ?? [],
      }),
    });
  }

  // ── Internal: Gmail API fetch ─────────────────────────────────────────

  private async gmailFetch(
    path: string,
    init?: RequestInit,
  ): Promise<unknown> {
    await this.refreshIfNeeded();

    const res = await this.fetchFn(
      `https://gmail.googleapis.com/gmail/v1/users/me${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.tokens.access_token}`,
          "Content-Type": "application/json",
          ...(init?.headers as Record<string, string> | undefined),
        },
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new GmailError(res.status, body);
    }

    // Some endpoints return 204 with no body
    const text = await res.text();
    if (!text) return {};
    return JSON.parse(text);
  }

  // ── Internal: MIME ────────────────────────────────────────────────────

  private buildMimeMessage(
    opts: Pick<SendOptions, "to" | "subject" | "body" | "cc" | "bcc" | "replyTo" | "threadId">,
  ): string {
    const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
    const lines: string[] = [
      `To: ${to}`,
      `Subject: ${opts.subject}`,
      "Content-Type: text/plain; charset=utf-8",
    ];

    if (opts.cc) {
      const cc = Array.isArray(opts.cc) ? opts.cc.join(", ") : opts.cc;
      lines.push(`Cc: ${cc}`);
    }

    if (opts.bcc) {
      const bcc = Array.isArray(opts.bcc) ? opts.bcc.join(", ") : opts.bcc;
      lines.push(`Bcc: ${bcc}`);
    }

    if (opts.replyTo) {
      lines.push(`In-Reply-To: ${opts.replyTo}`);
      lines.push(`References: ${opts.replyTo}`);
    }

    lines.push("", opts.body);
    return lines.join("\n");
  }

  // ── Internal: body extraction (ported from MCP server) ────────────────

  private extractBody(part: GmailMessagePart): string {
    // Try text/plain first
    const plain = this.extractMime(part, "text/plain");
    if (plain) return this.decodeBase64Url(plain);

    // Fall back to text/html with tag stripping
    const html = this.extractMime(part, "text/html");
    if (html) return this.stripHtml(this.decodeBase64Url(html));

    return "";
  }

  private extractMime(part: GmailMessagePart, mime: string): string | null {
    if (part.mimeType === mime && part.body?.data) {
      return part.body.data;
    }
    if (part.parts) {
      for (const sub of part.parts) {
        const result = this.extractMime(sub, mime);
        if (result) return result;
      }
    }
    return null;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractAttachments(
    part?: GmailMessagePart,
    result: Attachment[] = [],
  ): Attachment[] {
    if (!part) return result;

    if (part.filename && part.body?.attachmentId) {
      result.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }

    if (part.parts) {
      for (const sub of part.parts) {
        this.extractAttachments(sub, result);
      }
    }

    return result;
  }

  // ── Internal: headers ─────────────────────────────────────────────────

  private getHeader(msg: GmailRawMessage, name: string): string {
    const h = msg.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    );
    return h?.value ?? "";
  }

  private toSummary(msg: GmailRawMessage): EmailSummary {
    return {
      id: msg.id,
      threadId: msg.threadId ?? "",
      from: this.getHeader(msg, "From"),
      subject: this.getHeader(msg, "Subject"),
      date: this.getHeader(msg, "Date"),
      snippet: msg.snippet ?? "",
      labelIds: msg.labelIds ?? [],
    };
  }

  // ── Internal: base64url ───────────────────────────────────────────────

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    try {
      return atob(base64);
    } catch {
      return "[could not decode body]";
    }
  }

  private decodeBase64UrlToBytes(data: string): Uint8Array {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private encodeBase64Url(data: string): string {
    return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ── Internal: token refresh ───────────────────────────────────────────

  private async refreshIfNeeded(): Promise<void> {
    if (!this.autoRefresh) return;
    if (!this.tokens.refresh_token) return;
    if (!this.tokens.client_id || !this.tokens.client_secret) return;
    if (this.expiresAt && Date.now() < this.expiresAt - 60_000) return;

    // First call: we don't know when the token expires, so try using it.
    // If gmailFetch gets a 401, the caller should catch and re-auth.
    // But if we have an expiresAt and it's passed, proactively refresh.
    if (this.expiresAt === null) {
      // Assume current token is valid on first use. Set a short expiry
      // so we refresh on the next call if it was actually expired.
      // The gmailFetch caller handles 401s.
      this.expiresAt = Date.now() + 5 * 60_000; // assume 5 min remaining
      return;
    }

    const res = await this.fetchFn(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: this.tokens.refresh_token,
        client_id: this.tokens.client_id,
        client_secret: this.tokens.client_secret,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Token refresh failed: ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.tokens.access_token = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
  }
}
