import { describe, it, expect, vi, beforeEach } from "vitest";
import { Gmail, GmailError } from "./gmail";
import type { GmailTokens } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  let callIndex = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: (resp.status ?? 200) >= 200 && (resp.status ?? 200) < 300,
      status: resp.status ?? 200,
      statusText: resp.status === 401 ? "Unauthorized" : "OK",
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    } as unknown as Response;
  });

  return { fn, calls };
}

const BASE_TOKENS: GmailTokens = {
  access_token: "ya29.test-access-token",
};

function makeGmail(
  fetchFn: typeof globalThis.fetch,
  tokens?: Partial<GmailTokens>,
) {
  return new Gmail({ ...BASE_TOKENS, ...tokens }, { fetch: fetchFn, autoRefresh: false });
}

// ── Gmail raw message fixtures ───────────────────────────────────────────

function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_001",
    threadId: "thread_001",
    snippet: "Hey there...",
    labelIds: ["INBOX", "UNREAD"],
    payload: {
      headers: [
        { name: "From", value: "alice@example.com" },
        { name: "Subject", value: "Hello" },
        { name: "Date", value: "Mon, 10 Feb 2026 10:00:00 -0500" },
        { name: "To", value: "bob@example.com" },
        { name: "Cc", value: "" },
        { name: "Bcc", value: "" },
      ],
      mimeType: "text/plain",
      body: {
        // "Hello world" base64url encoded
        data: btoa("Hello world").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
        size: 11,
      },
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Gmail", () => {
  describe("list()", () => {
    it("lists emails with metadata", async () => {
      const { fn, calls } = mockFetch([
        // First call: list message IDs
        {
          body: {
            messages: [
              { id: "msg_001", threadId: "thread_001" },
              { id: "msg_002", threadId: "thread_002" },
            ],
            resultSizeEstimate: 2,
          },
        },
        // Second + third calls: metadata for each message
        { body: rawMessage({ id: "msg_001" }) },
        { body: rawMessage({ id: "msg_002", payload: { ...rawMessage().payload, headers: [
          { name: "From", value: "charlie@example.com" },
          { name: "Subject", value: "World" },
          { name: "Date", value: "Tue, 11 Feb 2026 10:00:00 -0500" },
        ]}})},
      ]);

      const gmail = makeGmail(fn);
      const result = await gmail.list({ query: "is:unread", max: 5 });

      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.messages[0].id).toBe("msg_001");
      expect(result.messages[0].from).toBe("alice@example.com");
      expect(result.messages[0].subject).toBe("Hello");

      // Verify first call is the list endpoint
      expect(calls[0].url).toContain("/messages?");
      expect(calls[0].url).toContain("q=is%3Aunread");
      expect(calls[0].url).toContain("maxResults=5");

      // Verify subsequent calls fetch metadata
      expect(calls[1].url).toContain("/messages/msg_001?format=metadata");
      expect(calls[2].url).toContain("/messages/msg_002?format=metadata");
    });

    it("returns empty list when no messages", async () => {
      const { fn } = mockFetch([
        { body: { messages: [], resultSizeEstimate: 0 } },
      ]);

      const gmail = makeGmail(fn);
      const result = await gmail.list();

      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("passes pageToken", async () => {
      const { fn, calls } = mockFetch([
        { body: { messages: [], resultSizeEstimate: 0 } },
      ]);

      const gmail = makeGmail(fn);
      await gmail.list({ pageToken: "token_abc" });

      expect(calls[0].url).toContain("pageToken=token_abc");
    });

    it("passes labelIds", async () => {
      const { fn, calls } = mockFetch([
        { body: { messages: [], resultSizeEstimate: 0 } },
      ]);

      const gmail = makeGmail(fn);
      await gmail.list({ labelIds: ["INBOX", "UNREAD"] });

      expect(calls[0].url).toContain("labelIds=INBOX");
      expect(calls[0].url).toContain("labelIds=UNREAD");
    });

    it("caps max at 100", async () => {
      const { fn, calls } = mockFetch([
        { body: { messages: [], resultSizeEstimate: 0 } },
      ]);

      const gmail = makeGmail(fn);
      await gmail.list({ max: 500 });

      expect(calls[0].url).toContain("maxResults=100");
    });
  });

  describe("get()", () => {
    it("fetches full message with body extraction", async () => {
      const { fn } = mockFetch([{ body: rawMessage() }]);

      const gmail = makeGmail(fn);
      const email = await gmail.get("msg_001");

      expect(email.id).toBe("msg_001");
      expect(email.from).toBe("alice@example.com");
      expect(email.subject).toBe("Hello");
      expect(email.body).toBe("Hello world");
      expect(email.labelIds).toEqual(["INBOX", "UNREAD"]);
    });

    it("extracts body from nested MIME parts", async () => {
      const multipartMsg = rawMessage({
        payload: {
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: btoa("Plain text body").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
              },
            },
            {
              mimeType: "text/html",
              body: {
                data: btoa("<p>HTML body</p>").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
              },
            },
          ],
          headers: rawMessage().payload.headers,
        },
      });

      const { fn } = mockFetch([{ body: multipartMsg }]);
      const gmail = makeGmail(fn);
      const email = await gmail.get("msg_001");

      expect(email.body).toBe("Plain text body");
    });
  });

  describe("send()", () => {
    it("sends email with MIME encoding", async () => {
      const { fn, calls } = mockFetch([
        { body: { id: "sent_001", threadId: "thread_sent_001" } },
      ]);

      const gmail = makeGmail(fn);
      const result = await gmail.send({
        to: "alice@example.com",
        subject: "Test subject",
        body: "Test body",
      });

      expect(result.id).toBe("sent_001");
      expect(result.threadId).toBe("thread_sent_001");

      // Verify the POST body contains base64url-encoded MIME
      const sentBody = JSON.parse(calls[0].init?.body as string);
      expect(sentBody.raw).toBeDefined();

      // Decode and verify MIME
      const decoded = atob(sentBody.raw.replace(/-/g, "+").replace(/_/g, "/"));
      expect(decoded).toContain("To: alice@example.com");
      expect(decoded).toContain("Subject: Test subject");
      expect(decoded).toContain("Test body");
    });

    it("handles array recipients", async () => {
      const { fn, calls } = mockFetch([
        { body: { id: "sent_002", threadId: "thread_002" } },
      ]);

      const gmail = makeGmail(fn);
      await gmail.send({
        to: ["alice@example.com", "bob@example.com"],
        cc: ["charlie@example.com"],
        subject: "Group email",
        body: "Hello everyone",
      });

      const sentBody = JSON.parse(calls[0].init?.body as string);
      const decoded = atob(sentBody.raw.replace(/-/g, "+").replace(/_/g, "/"));
      expect(decoded).toContain("To: alice@example.com, bob@example.com");
      expect(decoded).toContain("Cc: charlie@example.com");
    });

    it("includes reply headers when replyTo is set", async () => {
      const { fn, calls } = mockFetch([
        { body: { id: "sent_003", threadId: "thread_003" } },
      ]);

      const gmail = makeGmail(fn);
      await gmail.send({
        to: "alice@example.com",
        subject: "Re: Original",
        body: "Reply body",
        replyTo: "<original-msg-id@gmail.com>",
        threadId: "thread_003",
      });

      const sentBody = JSON.parse(calls[0].init?.body as string);
      expect(sentBody.threadId).toBe("thread_003");

      const decoded = atob(sentBody.raw.replace(/-/g, "+").replace(/_/g, "/"));
      expect(decoded).toContain("In-Reply-To: <original-msg-id@gmail.com>");
      expect(decoded).toContain("References: <original-msg-id@gmail.com>");
    });
  });

  describe("search()", () => {
    it("delegates to list with query", async () => {
      const { fn, calls } = mockFetch([
        { body: { messages: [], resultSizeEstimate: 0 } },
      ]);

      const gmail = makeGmail(fn);
      await gmail.search("subject:invoice has:attachment", { max: 20 });

      expect(calls[0].url).toContain("q=subject%3Ainvoice+has%3Aattachment");
      expect(calls[0].url).toContain("maxResults=20");
    });
  });

  describe("labels()", () => {
    it("lists labels", async () => {
      const { fn } = mockFetch([
        {
          body: {
            labels: [
              { id: "INBOX", name: "INBOX", type: "system", messagesTotal: 100, messagesUnread: 5 },
              { id: "Label_1", name: "Work", type: "user", messagesTotal: 50, messagesUnread: 2 },
            ],
          },
        },
      ]);

      const gmail = makeGmail(fn);
      const labels = await gmail.labels();

      expect(labels).toHaveLength(2);
      expect(labels[0].id).toBe("INBOX");
      expect(labels[0].type).toBe("system");
      expect(labels[1].name).toBe("Work");
      expect(labels[1].type).toBe("user");
    });
  });

  describe("archive()", () => {
    it("archives single message", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.archive("msg_001");

      expect(calls[0].url).toContain("/messages/msg_001/modify");
      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.removeLabelIds).toContain("INBOX");
    });

    it("archives multiple messages", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.archive(["msg_001", "msg_002"]);

      expect(calls[0].url).toContain("/messages/batchModify");
      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.ids).toEqual(["msg_001", "msg_002"]);
      expect(body.removeLabelIds).toContain("INBOX");
    });
  });

  describe("markRead()", () => {
    it("removes UNREAD label", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.markRead("msg_001");

      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.removeLabelIds).toContain("UNREAD");
    });
  });

  describe("markUnread()", () => {
    it("adds UNREAD label", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.markUnread("msg_001");

      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.addLabelIds).toContain("UNREAD");
    });
  });

  describe("trash()", () => {
    it("trashes a message", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.trash("msg_001");

      expect(calls[0].url).toContain("/messages/msg_001/trash");
      expect(calls[0].init?.method).toBe("POST");
    });

    it("trashes multiple messages in parallel", async () => {
      const { fn, calls } = mockFetch([{ body: {} }, { body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.trash(["msg_001", "msg_002"]);

      expect(calls).toHaveLength(2);
      expect(calls[0].url).toContain("/messages/msg_001/trash");
      expect(calls[1].url).toContain("/messages/msg_002/trash");
    });
  });

  describe("attachments()", () => {
    it("extracts attachment metadata from message", async () => {
      const msgWithAttachment = rawMessage({
        payload: {
          mimeType: "multipart/mixed",
          headers: rawMessage().payload.headers,
          parts: [
            {
              mimeType: "text/plain",
              body: { data: btoa("body text").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), size: 9 },
            },
            {
              mimeType: "application/pdf",
              filename: "invoice.pdf",
              body: { attachmentId: "att_001", size: 12345 },
            },
          ],
        },
      });

      const { fn } = mockFetch([{ body: msgWithAttachment }]);
      const gmail = makeGmail(fn);
      const atts = await gmail.attachments("msg_001");

      expect(atts).toHaveLength(1);
      expect(atts[0].id).toBe("att_001");
      expect(atts[0].filename).toBe("invoice.pdf");
      expect(atts[0].mimeType).toBe("application/pdf");
      expect(atts[0].size).toBe(12345);
    });
  });

  describe("attachment()", () => {
    it("downloads attachment data as Uint8Array", async () => {
      const msgWithAttachment = rawMessage({
        payload: {
          mimeType: "multipart/mixed",
          headers: rawMessage().payload.headers,
          parts: [
            { mimeType: "text/plain", body: { data: btoa("body"), size: 4 } },
            {
              mimeType: "application/pdf",
              filename: "report.pdf",
              body: { attachmentId: "att_001", size: 5 },
            },
          ],
        },
      });

      const attachmentData = btoa("hello").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const { fn } = mockFetch([
        // First call: get message to find attachment metadata
        { body: msgWithAttachment },
        // Second call: download attachment
        { body: { data: attachmentData, size: 5 } },
      ]);

      const gmail = makeGmail(fn);
      const att = await gmail.attachment("msg_001", "att_001");

      expect(att.id).toBe("att_001");
      expect(att.filename).toBe("report.pdf");
      expect(att.data).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(att.data)).toBe("hello");
    });
  });

  describe("profile()", () => {
    it("returns profile data", async () => {
      const { fn } = mockFetch([
        {
          body: {
            emailAddress: "test@gmail.com",
            messagesTotal: 5000,
            threadsTotal: 3000,
            historyId: "12345",
          },
        },
      ]);

      const gmail = makeGmail(fn);
      const profile = await gmail.profile();

      expect(profile.emailAddress).toBe("test@gmail.com");
      expect(profile.messagesTotal).toBe(5000);
    });
  });

  describe("auto-refresh", () => {
    it("refreshes token when expired", async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      let callIndex = 0;

      const responses = [
        // First call: profile succeeds (sets initial expiresAt)
        {
          url: "gmail",
          body: { emailAddress: "test@gmail.com", messagesTotal: 1, threadsTotal: 1, historyId: "1" },
        },
        // Second call: refresh token (after we manually expire)
        {
          url: "inbox.dog",
          body: { access_token: "ya29.new-token", expires_in: 3600 },
        },
        // Third call: profile with new token
        {
          url: "gmail",
          body: { emailAddress: "test@gmail.com", messagesTotal: 1, threadsTotal: 1, historyId: "2" },
        },
      ];

      const fn = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const resp = responses[callIndex++];
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => resp.body,
          text: async () => JSON.stringify(resp.body),
        } as unknown as Response;
      });

      const gmail = new Gmail(
        {
          access_token: "ya29.old-token",
          refresh_token: "refresh_token_123",
          client_id: "client_id_123",
          client_secret: "client_secret_123",
        },
        { fetch: fn, autoRefresh: true },
      );

      // First call succeeds normally
      await gmail.profile();

      // Force expiry by accessing private field (test hack)
      (gmail as unknown as { expiresAt: number }).expiresAt = Date.now() - 1000;

      // Second call should trigger refresh first
      await gmail.profile();

      // Verify refresh was called
      expect(calls[1].url).toContain("inbox.dog/oauth/token");
      const refreshBody = JSON.parse(calls[1].init?.body as string);
      expect(refreshBody.grant_type).toBe("refresh_token");
      expect(refreshBody.refresh_token).toBe("refresh_token_123");

      // Verify third call used new token
      expect(calls[2].url).toContain("gmail.googleapis.com");
      const authHeader = (calls[2].init?.headers as Record<string, string>)?.Authorization;
      expect(authHeader).toBe("Bearer ya29.new-token");
    });

    it("does not refresh when autoRefresh is false", async () => {
      const { fn, calls } = mockFetch([
        { body: { emailAddress: "test@gmail.com", messagesTotal: 1, threadsTotal: 1, historyId: "1" } },
      ]);

      const gmail = new Gmail(
        {
          access_token: "ya29.test",
          refresh_token: "refresh_123",
          client_id: "cid",
          client_secret: "csec",
        },
        { fetch: fn, autoRefresh: false },
      );

      await gmail.profile();

      // Only one call (profile), no refresh
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("gmail.googleapis.com");
    });
  });

  describe("error handling", () => {
    it("throws GmailError on API failure", async () => {
      const { fn } = mockFetch([
        {
          status: 401,
          body: { error: { code: 401, message: "Invalid credentials" } },
        },
      ]);

      const gmail = makeGmail(fn);

      await expect(gmail.profile()).rejects.toThrow(GmailError);
      await expect(gmail.profile()).rejects.toMatchObject({
        status: 401,
      });
    });

    it("throws GmailError on 404", async () => {
      const { fn } = mockFetch([
        {
          status: 404,
          body: { error: { code: 404, message: "Not found" } },
        },
      ]);

      const gmail = makeGmail(fn);

      await expect(gmail.get("nonexistent")).rejects.toThrow(GmailError);
    });
  });

  describe("batchModify()", () => {
    it("uses modify endpoint for single message", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.batchModify({
        ids: ["msg_001"],
        addLabelIds: ["Label_1"],
        removeLabelIds: ["INBOX"],
      });

      expect(calls[0].url).toContain("/messages/msg_001/modify");
    });

    it("uses batchModify endpoint for multiple messages", async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);

      const gmail = makeGmail(fn);
      await gmail.batchModify({
        ids: ["msg_001", "msg_002", "msg_003"],
        addLabelIds: ["Label_1"],
      });

      expect(calls[0].url).toContain("/messages/batchModify");
      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.ids).toHaveLength(3);
    });

    it("no-ops on empty ids", async () => {
      const { fn, calls } = mockFetch([]);

      const gmail = makeGmail(fn);
      await gmail.batchModify({ ids: [] });

      expect(calls).toHaveLength(0);
    });
  });
});
