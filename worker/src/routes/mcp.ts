import { Hono } from 'hono';
import type { Env } from '../types';

export const mcpRoutes = new Hono<{ Bindings: Env }>();

// ── JSON-RPC types ──────────────────────────────────────────────────────────

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

// ── Tool definitions (JSON Schema, not Zod) ─────────────────────────────────

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'inbox_dog_create_key',
    description:
      'Create a new inbox.dog API key for Gmail OAuth. Returns client_id and client_secret with 10 free credits. No authentication required.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'A name for the API key (e.g. "my-app"). Defaults to "default".',
        },
      },
      required: [],
    },
  },
  {
    name: 'inbox_dog_oauth_start',
    description:
      'Generate a Gmail OAuth authorization URL. The user must visit this URL to authenticate with Google. After authentication, they will be redirected to the redirect_uri with a ?code= parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Your inbox.dog client_id (starts with id_)',
        },
        redirect_uri: {
          type: 'string',
          format: 'uri',
          description:
            'URL where the user will be redirected after authentication with a ?code= parameter',
        },
        scope: {
          type: 'string',
          enum: ['email', 'email:read', 'email:send', 'email:full'],
          description:
            "Gmail permission scope. 'email' = read-only (default), 'email:read' = read-only, 'email:send' = send only, 'email:full' = full access",
        },
        state: {
          type: 'string',
          description:
            'Optional opaque value for CSRF protection, passed back in the redirect',
        },
      },
      required: ['client_id', 'redirect_uri'],
    },
  },
  {
    name: 'inbox_dog_exchange_code',
    description:
      'Exchange an authorization code (from the OAuth callback redirect) for Gmail access and refresh tokens. Costs 1 credit. The returned access_token works directly with the Gmail API.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'The authorization code from the OAuth callback redirect (?code= parameter)',
        },
        client_id: { type: 'string', description: 'Your inbox.dog client_id' },
        client_secret: {
          type: 'string',
          description: 'Your inbox.dog client_secret (starts with sk_)',
        },
      },
      required: ['code', 'client_id', 'client_secret'],
    },
  },
  {
    name: 'inbox_dog_refresh_token',
    description:
      'Use a refresh token to get a new Gmail access token. Access tokens expire after 1 hour. This operation is free (no credit cost).',
    inputSchema: {
      type: 'object',
      properties: {
        refresh_token: {
          type: 'string',
          description: 'The refresh_token from a previous token exchange',
        },
        client_id: { type: 'string', description: 'Your inbox.dog client_id' },
        client_secret: {
          type: 'string',
          description: 'Your inbox.dog client_secret',
        },
      },
      required: ['refresh_token', 'client_id', 'client_secret'],
    },
  },
  {
    name: 'inbox_dog_check_credits',
    description:
      'Check remaining credits and API key info. Each OAuth token exchange costs 1 credit. Token refreshes are free.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Your inbox.dog client_id' },
        client_secret: {
          type: 'string',
          description: 'Your inbox.dog client_secret',
        },
      },
      required: ['client_id', 'client_secret'],
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function jsonrpcResult(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function toolContent(text: string, isError?: boolean) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

async function internalFetch(
  origin: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const resp = await fetch(`${origin}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  const data: unknown = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

// ── Tool executor ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  origin: string,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  switch (name) {
    case 'inbox_dog_create_key': {
      const res = await internalFetch(origin, '/api/keys', {
        method: 'POST',
        body: JSON.stringify({ name: (args['name'] as string | undefined) ?? 'default' }),
      });
      if (!res.ok) return toolContent(`Failed to create API key: ${JSON.stringify(res.data)}`, true);
      return toolContent(JSON.stringify(res.data, null, 2));
    }

    case 'inbox_dog_oauth_start': {
      const clientId = args['client_id'] as string;
      const redirectUri = args['redirect_uri'] as string;
      const scope = args['scope'] as string | undefined;
      const state = args['state'] as string | undefined;

      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
      if (scope) params.set('scope', scope);
      if (state) params.set('state', state);

      const authUrl = `${origin}/oauth/authorize?${params.toString()}`;
      return toolContent(
        JSON.stringify(
          {
            auth_url: authUrl,
            instructions:
              'Direct the user to visit this URL to authenticate with Google. After consent, they will be redirected to the redirect_uri with a ?code= parameter. Use inbox_dog_exchange_code to exchange that code for tokens.',
          },
          null,
          2,
        ),
      );
    }

    case 'inbox_dog_exchange_code': {
      const res = await internalFetch(origin, '/oauth/token', {
        method: 'POST',
        body: JSON.stringify({
          code: args['code'],
          client_id: args['client_id'],
          client_secret: args['client_secret'],
        }),
      });
      if (!res.ok) return toolContent(`Token exchange failed: ${JSON.stringify(res.data)}`, true);
      return toolContent(JSON.stringify(res.data, null, 2));
    }

    case 'inbox_dog_refresh_token': {
      const res = await internalFetch(origin, '/oauth/token', {
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: args['refresh_token'],
          client_id: args['client_id'],
          client_secret: args['client_secret'],
        }),
      });
      if (!res.ok) return toolContent(`Token refresh failed: ${JSON.stringify(res.data)}`, true);
      return toolContent(JSON.stringify(res.data, null, 2));
    }

    case 'inbox_dog_check_credits': {
      const clientId = args['client_id'] as string;
      const clientSecret = args['client_secret'] as string;
      const res = await internalFetch(origin, `/api/keys/${encodeURIComponent(clientId)}`, {
        method: 'GET',
        headers: { 'X-Client-Secret': clientSecret },
      });
      if (!res.ok) return toolContent(`Failed to check credits: ${JSON.stringify(res.data)}`, true);
      return toolContent(JSON.stringify(res.data, null, 2));
    }

    default:
      return toolContent(`Unknown tool: ${name}`, true);
  }
}

// ── JSON-RPC dispatcher ─────────────────────────────────────────────────────

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return obj['jsonrpc'] === '2.0' && typeof obj['method'] === 'string';
}

mcpRoutes.post('/', async (c) => {
  const origin = new URL(c.req.url).origin;

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

  switch (method) {
    // ── initialize ────────────────────────────────────────────────────────
    case 'initialize': {
      if (isNotification) return c.body(null, 204);
      return c.json(
        jsonrpcResult(id ?? null, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'inbox-dog', version: '0.1.0' },
        }),
        200,
      );
    }

    // ── notifications/initialized ────────────────────────────────────────
    case 'notifications/initialized': {
      return c.body(null, 204);
    }

    // ── tools/list ───────────────────────────────────────────────────────
    case 'tools/list': {
      if (isNotification) return c.body(null, 204);
      return c.json(jsonrpcResult(id ?? null, { tools: TOOLS }), 200);
    }

    // ── tools/call ───────────────────────────────────────────────────────
    case 'tools/call': {
      if (isNotification) return c.body(null, 204);
      const toolParams = (params ?? {}) as Record<string, unknown>;
      const toolName = toolParams['name'] as string | undefined;
      const toolArgs = (toolParams['arguments'] ?? {}) as Record<string, unknown>;

      if (!toolName) {
        return c.json(
          jsonrpcError(id ?? null, -32602, 'Invalid params: missing tool name'),
          200,
        );
      }

      if (!TOOLS.some((t) => t.name === toolName)) {
        return c.json(
          jsonrpcError(id ?? null, -32602, `Unknown tool: ${toolName}`),
          200,
        );
      }

      const result = await executeTool(toolName, toolArgs, origin);
      return c.json(jsonrpcResult(id ?? null, result), 200);
    }

    // ── unknown method ───────────────────────────────────────────────────
    default: {
      if (isNotification) return c.body(null, 204);
      return c.json(jsonrpcError(id ?? null, -32601, 'Method not found'), 200);
    }
  }
});
