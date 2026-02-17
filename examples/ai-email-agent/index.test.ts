import { describe, it, expect, vi } from "vitest";
import { Gmail } from "inbox.dog";
import { buildPrompt, applyDecision, RULES } from "./agent";
import type { Decision } from "./agent";

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      statusText: "OK",
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    } as unknown as Response;
  });

  return { fn, calls };
}

function makeGmail(fetchFn: typeof globalThis.fetch) {
  return new Gmail({ access_token: "ya29.test" }, { fetch: fetchFn, autoRefresh: false });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("includes rules, from, subject, and snippet", () => {
    const prompt = buildPrompt("alice@example.com", "Your order shipped", "Track your package...");

    expect(prompt).toContain(RULES);
    expect(prompt).toContain("From: alice@example.com");
    expect(prompt).toContain("Subject: Your order shipped");
    expect(prompt).toContain("Snippet: Track your package...");
    expect(prompt).toContain("Respond with JSON only.");
  });
});

describe("applyDecision", () => {
  it("archives and marks read when action is archive", async () => {
    const { fn, calls } = mockFetch([
      { body: {} }, // archive (removeLabelIds: INBOX)
      { body: {} }, // markRead (removeLabelIds: UNREAD)
    ]);
    const gmail = makeGmail(fn);
    const decision: Decision = { action: "archive", reason: "spam" };

    await applyDecision(gmail, "msg_001", decision, new Map());

    expect(calls).toHaveLength(2);
    // archive call
    expect(calls[0].url).toContain("/messages/msg_001/modify");
    const archiveBody = JSON.parse(calls[0].init?.body as string);
    expect(archiveBody.removeLabelIds).toContain("INBOX");
    // markRead call
    const readBody = JSON.parse(calls[1].init?.body as string);
    expect(readBody.removeLabelIds).toContain("UNREAD");
  });

  it("only marks read when action is skip", async () => {
    const { fn, calls } = mockFetch([
      { body: {} }, // markRead
    ]);
    const gmail = makeGmail(fn);
    const decision: Decision = { action: "skip", reason: "from a real human" };

    await applyDecision(gmail, "msg_001", decision, new Map());

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.removeLabelIds).toContain("UNREAD");
  });

  it("applies labels before archiving", async () => {
    const { fn, calls } = mockFetch([
      { body: {} }, // addLabels
      { body: {} }, // archive
      { body: {} }, // markRead
    ]);
    const gmail = makeGmail(fn);
    const labelMap = new Map([["Receipts", "Label_42"]]);
    const decision: Decision = {
      action: "archive",
      labels: ["Receipts"],
      reason: "order confirmation",
    };

    await applyDecision(gmail, "msg_001", decision, labelMap);

    expect(calls).toHaveLength(3);
    // addLabels resolves name → id via labelMap
    const labelBody = JSON.parse(calls[0].init?.body as string);
    expect(labelBody.addLabelIds).toContain("Label_42");
  });

  it("uses label name as fallback when not in labelMap", async () => {
    const { fn, calls } = mockFetch([
      { body: {} }, // addLabels
      { body: {} }, // markRead
    ]);
    const gmail = makeGmail(fn);
    const decision: Decision = {
      action: "label",
      labels: ["NewLabel"],
      reason: "categorize",
    };

    await applyDecision(gmail, "msg_001", decision, new Map());

    const labelBody = JSON.parse(calls[0].init?.body as string);
    expect(labelBody.addLabelIds).toContain("NewLabel");
  });

  it("skips labels when decision has no labels", async () => {
    const { fn, calls } = mockFetch([
      { body: {} }, // archive
      { body: {} }, // markRead
    ]);
    const gmail = makeGmail(fn);
    const decision: Decision = { action: "archive", reason: "junk" };

    await applyDecision(gmail, "msg_001", decision, new Map());

    // Should only have archive + markRead, no addLabels
    expect(calls).toHaveLength(2);
  });
});
