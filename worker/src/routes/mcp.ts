import { Hono } from 'hono';
import type { Env } from '../types';

export const mcpRoutes = new Hono<{ Bindings: Env }>();

// ── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

// ── Tool definitions ─────────────────────────────────────────────────────────
// These are the REAL tools — email operations, not auth plumbing.
// Auth is handled at the protocol level via MCP OAuth spec.

const TOOLS: McpToolDef[] = [
  {
    name: 'read_emails',
    description: 'List recent emails from the authenticated Gmail account. Returns message IDs, subjects, senders, and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max emails to return (default 10, max 100)' },
        query: { type: 'string', description: 'Gmail search query (e.g. "from:alice", "is:unread", "subject:invoice")' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Filter by label IDs (e.g. ["INBOX", "UNREAD"])' },
      },
    },
  },
  {
    name: 'read_email',
    description: 'Read the full content of a specific email by message ID.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email from the authenticated Gmail account.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text)' },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'search_emails',
    description: 'Search emails using Gmail search syntax. Returns matching message IDs and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "has:attachment from:boss after:2024/01/01")' },
        maxResults: { type: 'number', description: 'Max results (default 10, max 100)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_profile',
    description: 'Get the authenticated user\'s Gmail profile (email address, total messages, threads).',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonrpcResult(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function ok(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }] };
}

function fail(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

// ── Gmail API proxy ─────────────────────────────────────────────────────────

async function gmailFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const data: unknown = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: GmailMessagePart;
  internalDate?: string;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  resultSizeEstimate?: number;
  nextPageToken?: string;
}

function getHeader(msg: GmailMessage, name: string): string {
  const h = msg.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? '';
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return atob(base64);
  } catch {
    return '[could not decode body]';
  }
}

function extractBody(part: GmailMessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const sub of part.parts) {
      const result = extractBody(sub);
      if (result) return result;
    }
  }
  return '';
}

// ── Tool executor ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  accessToken: string,
): Promise<ToolResult> {
  switch (name) {
    case 'read_emails': {
      const maxResults = Math.min(Number(args['maxResults'] ?? 10), 100);
      const query = args['query'] as string | undefined;
      const labelIds = args['labelIds'] as string[] | undefined;

      const params = new URLSearchParams({ maxResults: String(maxResults) });
      if (query) params.set('q', query);
      if (labelIds) {
        for (const l of labelIds) params.append('labelIds', l);
      }

      const listRes = await gmailFetch(accessToken, `/messages?${params.toString()}`);
      if (!listRes.ok) return fail(`Gmail API error: ${JSON.stringify(listRes.data)}`);

      const list = listRes.data as GmailListResponse;
      if (!list.messages || list.messages.length === 0) {
        return ok(JSON.stringify({ messages: [], total: 0 }));
      }

      // Fetch metadata for each message
      const summaries = await Promise.all(
        list.messages.slice(0, maxResults).map(async (m) => {
          const msgRes = await gmailFetch(accessToken, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          if (!msgRes.ok) return { id: m.id, error: 'failed to fetch' };
          const msg = msgRes.data as GmailMessage;
          return {
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader(msg, 'From'),
            subject: getHeader(msg, 'Subject'),
            date: getHeader(msg, 'Date'),
            snippet: msg.snippet,
          };
        }),
      );

      return ok(JSON.stringify({ messages: summaries, total: list.resultSizeEstimate ?? summaries.length }, null, 2));
    }

    case 'read_email': {
      const messageId = args['messageId'] as string;
      if (!messageId) return fail('messageId is required');

      const res = await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
      if (!res.ok) return fail(`Gmail API error: ${JSON.stringify(res.data)}`);

      const msg = res.data as GmailMessage;
      const body = msg.payload ? extractBody(msg.payload) : '';

      return ok(JSON.stringify({
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader(msg, 'From'),
        to: getHeader(msg, 'To'),
        subject: getHeader(msg, 'Subject'),
        date: getHeader(msg, 'Date'),
        body,
      }, null, 2));
    }

    case 'send_email': {
      const to = args['to'] as string;
      const subject = args['subject'] as string;
      const body = args['body'] as string;
      const cc = args['cc'] as string | undefined;
      const bcc = args['bcc'] as string | undefined;

      if (!to || !subject || !body) return fail('to, subject, and body are required');

      let rawEmail = `To: ${to}\nSubject: ${subject}\nContent-Type: text/plain; charset=utf-8\n`;
      if (cc) rawEmail += `Cc: ${cc}\n`;
      if (bcc) rawEmail += `Bcc: ${bcc}\n`;
      rawEmail += `\n${body}`;

      // Base64url encode
      const encoded = btoa(rawEmail).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const res = await gmailFetch(accessToken, '/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: encoded }),
      });

      if (!res.ok) return fail(`Send failed: ${JSON.stringify(res.data)}`);
      const sent = res.data as { id: string; threadId: string };
      return ok(JSON.stringify({ sent: true, messageId: sent.id, threadId: sent.threadId }));
    }

    case 'search_emails': {
      const query = args['query'] as string;
      const maxResults = Math.min(Number(args['maxResults'] ?? 10), 100);

      if (!query) return fail('query is required');

      const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
      const res = await gmailFetch(accessToken, `/messages?${params.toString()}`);
      if (!res.ok) return fail(`Gmail API error: ${JSON.stringify(res.data)}`);

      const list = res.data as GmailListResponse;
      if (!list.messages || list.messages.length === 0) {
        return ok(JSON.stringify({ messages: [], total: 0 }));
      }

      const summaries = await Promise.all(
        list.messages.slice(0, maxResults).map(async (m) => {
          const msgRes = await gmailFetch(accessToken, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          if (!msgRes.ok) return { id: m.id, error: 'failed to fetch' };
          const msg = msgRes.data as GmailMessage;
          return {
            id: msg.id,
            from: getHeader(msg, 'From'),
            subject: getHeader(msg, 'Subject'),
            date: getHeader(msg, 'Date'),
            snippet: msg.snippet,
          };
        }),
      );

      return ok(JSON.stringify({ messages: summaries, total: list.resultSizeEstimate ?? summaries.length }, null, 2));
    }

    case 'get_profile': {
      const res = await gmailFetch(accessToken, '/profile');
      if (!res.ok) return fail(`Gmail API error: ${JSON.stringify(res.data)}`);
      return ok(JSON.stringify(res.data, null, 2));
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

// ── Bearer token → Gmail access token resolution ────────────────────────────

async function resolveAccessToken(
  bearerToken: string,
  env: Env,
): Promise<string | null> {
  // Bearer token is a session ID that maps to stored Gmail tokens
  const sessionJson = await env.KV.get(`mcp_session:${bearerToken}`);
  if (!sessionJson) return null;

  const session = JSON.parse(sessionJson) as {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email: string;
  };

  // If token is still valid (with 60s buffer), use it
  if (Date.now() < session.expiresAt - 60_000) {
    return session.accessToken;
  }

  // Token expired — refresh it
  const refreshResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: session.refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!refreshResp.ok) return null;

  const refreshData = await refreshResp.json() as { access_token: string; expires_in: number };

  // Update session with new access token
  const updated = {
    ...session,
    accessToken: refreshData.access_token,
    expiresAt: Date.now() + refreshData.expires_in * 1000,
  };
  await env.KV.put(`mcp_session:${bearerToken}`, JSON.stringify(updated), {
    expirationTtl: 90 * 24 * 60 * 60, // 90 days
  });

  return refreshData.access_token;
}

// ── JSON-RPC dispatcher ─────────────────────────────────────────────────────

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return obj['jsonrpc'] === '2.0' && typeof obj['method'] === 'string';
}

mcpRoutes.post('/', async (c) => {
  const origin = new URL(c.req.url).origin;

  // Parse JSON-RPC request
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(jsonrpcError(null, -32700, 'Parse error'), 200);
  }

  if (!isJsonRpcRequest(body)) {
    return c.json(jsonrpcError(null, -32600, 'Invalid Request'), 200);
  }

  const { method, id, params } = body;
  const isNotification = id === undefined || id === null;

  // initialize and tools/list don't require auth
  switch (method) {
    case 'initialize': {
      if (isNotification) return c.body(null, 204);
      return c.json(
        jsonrpcResult(id ?? null, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'inbox-dog', version: '0.2.0' },
        }),
        200,
      );
    }

    case 'notifications/initialized':
      return c.body(null, 204);

    case 'tools/list': {
      if (isNotification) return c.body(null, 204);
      return c.json(jsonrpcResult(id ?? null, { tools: TOOLS }), 200);
    }

    case 'tools/call': {
      if (isNotification) return c.body(null, 204);

      // tools/call REQUIRES auth — extract bearer token
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        // Return 401 with resource metadata per MCP auth spec
        c.header('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`);
        return c.json(
          jsonrpcError(id ?? null, -32001, 'Authentication required. See WWW-Authenticate header for OAuth metadata.'),
          401,
        );
      }

      const bearerToken = authHeader.slice(7);
      const accessToken = await resolveAccessToken(bearerToken, c.env);

      if (!accessToken) {
        c.header('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource" error="invalid_token"`);
        return c.json(
          jsonrpcError(id ?? null, -32001, 'Invalid or expired token. Re-authenticate via OAuth.'),
          401,
        );
      }

      const toolParams = (params ?? {}) as Record<string, unknown>;
      const toolName = toolParams['name'] as string | undefined;
      const toolArgs = (toolParams['arguments'] ?? {}) as Record<string, unknown>;

      if (!toolName) {
        return c.json(jsonrpcError(id ?? null, -32602, 'Invalid params: missing tool name'), 200);
      }

      if (!TOOLS.some((t) => t.name === toolName)) {
        return c.json(jsonrpcError(id ?? null, -32602, `Unknown tool: ${toolName}`), 200);
      }

      const result = await executeTool(toolName, toolArgs, accessToken);
      return c.json(jsonrpcResult(id ?? null, result), 200);
    }

    default: {
      if (isNotification) return c.body(null, 204);
      return c.json(jsonrpcError(id ?? null, -32601, 'Method not found'), 200);
    }
  }
});
