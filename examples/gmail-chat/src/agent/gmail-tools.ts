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
    throw new Error(`Gmail API ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------- Types for Gmail API responses ----------

interface GmailMessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  headers?: GmailHeader[];
  body: { data?: string; size: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  filename?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: GmailMessagePart;
}

interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

interface GmailModifyResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
}

interface GmailSendResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
}

// ---------- Helpers ----------

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

function encodeBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? "";
}

function extractBody(
  part: GmailMessagePart,
  preferredMime: string = "text/plain",
): string {
  // Simple message with body data
  if (part.body.data && part.mimeType === preferredMime) {
    return decodeBase64Url(part.body.data);
  }

  // Recurse into parts
  if (part.parts) {
    // First pass: look for preferred mime type
    for (const child of part.parts) {
      if (child.mimeType === preferredMime && child.body.data) {
        return decodeBase64Url(child.body.data);
      }
    }
    // Second pass: recurse into multipart children
    for (const child of part.parts) {
      if (child.parts) {
        const result = extractBody(child, preferredMime);
        if (result) return result;
      }
    }
    // Fallback: try text/html if we were looking for text/plain
    if (preferredMime === "text/plain") {
      return extractBody(part, "text/html");
    }
  }

  // Last resort: body data on the top-level part itself
  if (part.body.data) {
    return decodeBase64Url(part.body.data);
  }

  return "";
}

interface AttachmentInfo {
  filename: string;
  mimeType: string;
  attachmentId: string;
}

function extractAttachments(part: GmailMessagePart): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];

  if (part.filename && part.body.attachmentId) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      attachmentId: part.body.attachmentId,
    });
  }

  if (part.parts) {
    for (const child of part.parts) {
      attachments.push(...extractAttachments(child));
    }
  }

  return attachments;
}

interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labelIds: string[];
}

function parseMessageToSummary(msg: GmailMessage): EmailSummary {
  const headers = msg.payload.headers;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    snippet: msg.snippet,
    labelIds: msg.labelIds ?? [],
  };
}

async function fetchMessageSummaries(
  token: string,
  messageIds: Array<{ id: string }>,
): Promise<EmailSummary[]> {
  const results = await Promise.all(
    messageIds.map(async ({ id }) => {
      const msg = (await gmailApi(
        token,
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      )) as GmailMessage;
      return parseMessageToSummary(msg);
    }),
  );
  return results;
}

// ---------- Zod schemas ----------

const listEmailsSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Gmail search query (e.g. 'is:unread', 'from:alice')"),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of results to return (default: 10)"),
});

const getEmailSchema = z.object({
  messageId: z.string().describe("The Gmail message ID"),
});

const searchEmailsSchema = z.object({
  query: z.string().describe("Gmail search query (required)"),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of results to return (default: 10)"),
});

const sendEmailSchema = z.object({
  to: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Plain text email body"),
  cc: z.string().optional().describe("CC recipient(s)"),
  bcc: z.string().optional().describe("BCC recipient(s)"),
  inReplyTo: z
    .string()
    .optional()
    .describe("Message-ID header of the email being replied to"),
  threadId: z
    .string()
    .optional()
    .describe("Thread ID to send the reply in"),
});

const emptySchema = z.object({});

const modifyEmailSchema = z.object({
  messageId: z.string().describe("The Gmail message ID"),
  addLabels: z
    .array(z.string())
    .optional()
    .describe("Label IDs to add (e.g. ['STARRED', 'UNREAD'])"),
  removeLabels: z
    .array(z.string())
    .optional()
    .describe("Label IDs to remove (e.g. ['INBOX', 'UNREAD'])"),
});

const trashEmailSchema = z.object({
  messageId: z.string().describe("The Gmail message ID to trash"),
});

// ---------- Inferred types ----------

type ListEmailsInput = z.infer<typeof listEmailsSchema>;
type GetEmailInput = z.infer<typeof getEmailSchema>;
type SearchEmailsInput = z.infer<typeof searchEmailsSchema>;
type SendEmailInput = z.infer<typeof sendEmailSchema>;
type ModifyEmailInput = z.infer<typeof modifyEmailSchema>;
type TrashEmailInput = z.infer<typeof trashEmailSchema>;

// ---------- Tool definitions ----------

export function createGmailTools(accessToken: string): ToolSet {
  return {
    list_emails: tool({
      description:
        "List emails from the inbox. Optionally filter with a Gmail search query.",
      inputSchema: listEmailsSchema,
      execute: async (input: ListEmailsInput) => {
        const max = input.maxResults ?? 10;
        const params = new URLSearchParams({ maxResults: String(max) });
        if (input.query) params.set("q", input.query);

        const list = (await gmailApi(
          accessToken,
          `/messages?${params.toString()}`,
        )) as GmailMessageListResponse;

        if (!list.messages || list.messages.length === 0) {
          return [];
        }

        return fetchMessageSummaries(accessToken, list.messages);
      },
    }),

    get_email: tool({
      description:
        "Get the full content of an email by its message ID, including decoded body text.",
      inputSchema: getEmailSchema,
      execute: async (input: GetEmailInput) => {
        const msg = (await gmailApi(
          accessToken,
          `/messages/${input.messageId}?format=full`,
        )) as GmailMessage;

        const headers = msg.payload.headers;
        const body = extractBody(msg.payload);
        const attachments = extractAttachments(msg.payload);

        return {
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          cc: getHeader(headers, "Cc"),
          subject: getHeader(headers, "Subject"),
          date: getHeader(headers, "Date"),
          snippet: msg.snippet,
          body,
          labelIds: msg.labelIds ?? [],
          attachments,
        };
      },
    }),

    search_emails: tool({
      description:
        "Search emails using Gmail query syntax (e.g. 'from:bob subject:meeting after:2024/01/01').",
      inputSchema: searchEmailsSchema,
      execute: async (input: SearchEmailsInput) => {
        const max = input.maxResults ?? 10;
        const params = new URLSearchParams({
          q: input.query,
          maxResults: String(max),
        });

        const list = (await gmailApi(
          accessToken,
          `/messages?${params.toString()}`,
        )) as GmailMessageListResponse;

        if (!list.messages || list.messages.length === 0) {
          return [];
        }

        return fetchMessageSummaries(accessToken, list.messages);
      },
    }),

    send_email: tool({
      description:
        "Send an email. Supports replies via inReplyTo and threadId.",
      inputSchema: sendEmailSchema,
      execute: async (input: SendEmailInput) => {
        const lines: string[] = [
          `To: ${input.to}`,
          `Subject: ${input.subject}`,
          `Content-Type: text/plain; charset="UTF-8"`,
        ];
        if (input.cc) lines.push(`Cc: ${input.cc}`);
        if (input.bcc) lines.push(`Bcc: ${input.bcc}`);
        if (input.inReplyTo) {
          lines.push(`In-Reply-To: ${input.inReplyTo}`);
          lines.push(`References: ${input.inReplyTo}`);
        }
        lines.push("", input.body);

        const raw = encodeBase64Url(lines.join("\r\n"));

        const payload: Record<string, string> = { raw };
        if (input.threadId) payload["threadId"] = input.threadId;

        const result = (await gmailApi(accessToken, "/messages/send", {
          method: "POST",
          body: payload,
        })) as GmailSendResponse;

        return {
          id: result.id,
          threadId: result.threadId,
          labelIds: result.labelIds ?? [],
        };
      },
    }),

    get_profile: tool({
      description:
        "Get the authenticated user's Gmail profile information.",
      inputSchema: emptySchema,
      execute: async () => {
        const profile = (await gmailApi(
          accessToken,
          "/profile",
        )) as GmailProfile;

        return {
          emailAddress: profile.emailAddress,
          messagesTotal: profile.messagesTotal,
          threadsTotal: profile.threadsTotal,
          historyId: profile.historyId,
        };
      },
    }),

    modify_email: tool({
      description:
        "Modify email labels. Use to archive (remove INBOX), star (add STARRED), mark read (remove UNREAD), mark unread (add UNREAD), or apply any label.",
      inputSchema: modifyEmailSchema,
      execute: async (input: ModifyEmailInput) => {
        const result = (await gmailApi(
          accessToken,
          `/messages/${input.messageId}/modify`,
          {
            method: "POST",
            body: {
              addLabelIds: input.addLabels ?? [],
              removeLabelIds: input.removeLabels ?? [],
            },
          },
        )) as GmailModifyResponse;

        return {
          id: result.id,
          threadId: result.threadId,
          labelIds: result.labelIds ?? [],
        };
      },
    }),

    trash_email: tool({
      description: "Move an email to the trash.",
      inputSchema: trashEmailSchema,
      execute: async (input: TrashEmailInput) => {
        const result = (await gmailApi(
          accessToken,
          `/messages/${input.messageId}/trash`,
          { method: "POST" },
        )) as GmailModifyResponse;

        return {
          id: result.id,
          threadId: result.threadId,
          labelIds: result.labelIds ?? [],
        };
      },
    }),
  };
}
