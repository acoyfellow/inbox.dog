/**
 * Minimal Gmail surface for Code Mode: only gmail_get and gmail_post.
 * The model generates code that calls these; we do not hand-write list/search/send etc.
 */
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailApi(
  token: string,
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    method: opts?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gmail API ${res.status}: ${text}`);
    console.error("[gmail_api]", res.status, path, text.slice(0, 500));
    throw err;
  }
  return res.json();
}

const gmailGetSchema = z.object({
  path: z.string().describe("Path relative to /gmail/v1/users/me (e.g. /profile, /messages?q=in:inbox&maxResults=10)"),
});

const gmailPostSchema = z.object({
  path: z.string().describe("Path relative to /gmail/v1/users/me (e.g. /messages/send)"),
  body: z.record(z.string(), z.unknown()).describe("JSON body for the POST request"),
});

export function createGmailTools(accessToken: string): ToolSet {
  return {
    gmail_get: tool({
      description: "GET from Gmail REST API. Path is relative to /gmail/v1/users/me.",
      inputSchema: gmailGetSchema,
      execute: async ({ path }) => gmailApi(accessToken, path.startsWith("/") ? path : `/${path}`),
    }),
    gmail_post: tool({
      description: "POST to Gmail REST API. Path is relative to /gmail/v1/users/me.",
      inputSchema: gmailPostSchema,
      execute: async ({ path, body }) =>
        gmailApi(accessToken, path.startsWith("/") ? path : `/${path}`, { method: "POST", body }),
    }),
  };
}
