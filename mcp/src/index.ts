#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.INBOX_DOG_BASE_URL || "https://inbox.dog";

const server = new McpServer({
  name: "inbox-dog",
  version: "0.1.0",
});

async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

// Tool: Create API key
server.registerTool(
  "inbox_dog_create_key",
  {
    title: "Create inbox.dog API Key",
    description:
      "Create a new inbox.dog API key for Gmail OAuth. Returns client_id and client_secret with 10 free credits. No authentication required.",
    inputSchema: {
      name: z
        .string()
        .optional()
        .describe('A name for the API key (e.g. "my-app"). Defaults to "default".'),
    },
  },
  async ({ name }) => {
    const result = await apiRequest("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: name || "default" }),
    });

    if (!result.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to create API key: ${JSON.stringify(result.data)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
);

// Tool: Start OAuth flow
server.registerTool(
  "inbox_dog_oauth_start",
  {
    title: "Start Gmail OAuth Flow",
    description:
      "Generate a Gmail OAuth authorization URL. The user must visit this URL to authenticate with Google. After authentication, they will be redirected to the redirect_uri with a ?code= parameter.",
    inputSchema: {
      client_id: z.string().describe("Your inbox.dog client_id (starts with id_)"),
      redirect_uri: z
        .string()
        .url()
        .describe("URL where the user will be redirected after authentication with a ?code= parameter"),
      scope: z
        .enum(["email", "email:read", "email:send", "email:full"])
        .optional()
        .describe(
          "Gmail permission scope. 'email' = read-only (default), 'email:read' = read-only, 'email:send' = send only, 'email:full' = full access"
        ),
      state: z
        .string()
        .optional()
        .describe("Optional opaque value for CSRF protection, passed back in the redirect"),
    },
  },
  async ({ client_id, redirect_uri, scope, state }) => {
    const params = new URLSearchParams({
      client_id,
      redirect_uri,
    });
    if (scope) params.set("scope", scope);
    if (state) params.set("state", state);

    const authUrl = `${BASE_URL}/oauth/authorize?${params.toString()}`;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              auth_url: authUrl,
              instructions:
                "Direct the user to visit this URL to authenticate with Google. After consent, they will be redirected to the redirect_uri with a ?code= parameter. Use inbox_dog_exchange_code to exchange that code for tokens.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool: Exchange code for tokens
server.registerTool(
  "inbox_dog_exchange_code",
  {
    title: "Exchange OAuth Code for Gmail Tokens",
    description:
      "Exchange an authorization code (from the OAuth callback redirect) for Gmail access and refresh tokens. Costs 1 credit. The returned access_token works directly with the Gmail API (gmail.googleapis.com).",
    inputSchema: {
      code: z
        .string()
        .describe("The authorization code from the OAuth callback redirect (?code= parameter)"),
      client_id: z.string().describe("Your inbox.dog client_id"),
      client_secret: z.string().describe("Your inbox.dog client_secret (starts with sk_)"),
    },
  },
  async ({ code, client_id, client_secret }) => {
    const result = await apiRequest("/oauth/token", {
      method: "POST",
      body: JSON.stringify({ code, client_id, client_secret }),
    });

    if (!result.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Token exchange failed: ${JSON.stringify(result.data)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
);

// Tool: Refresh access token
server.registerTool(
  "inbox_dog_refresh_token",
  {
    title: "Refresh Gmail Access Token",
    description:
      "Use a refresh token to get a new Gmail access token. Access tokens expire after 1 hour. This operation is free (no credit cost).",
    inputSchema: {
      refresh_token: z.string().describe("The refresh_token from a previous token exchange"),
      client_id: z.string().describe("Your inbox.dog client_id"),
      client_secret: z.string().describe("Your inbox.dog client_secret"),
    },
  },
  async ({ refresh_token, client_id, client_secret }) => {
    const result = await apiRequest("/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token,
        client_id,
        client_secret,
      }),
    });

    if (!result.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Token refresh failed: ${JSON.stringify(result.data)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
);

// Tool: Check key info / credits
server.registerTool(
  "inbox_dog_check_credits",
  {
    title: "Check inbox.dog Credits",
    description:
      "Check remaining credits and API key info. Each OAuth token exchange costs 1 credit. Token refreshes are free.",
    inputSchema: {
      client_id: z.string().describe("Your inbox.dog client_id"),
      client_secret: z.string().describe("Your inbox.dog client_secret"),
    },
  },
  async ({ client_id, client_secret }) => {
    const result = await apiRequest(`/api/keys/${client_id}`, {
      method: "GET",
      headers: {
        "X-Client-Secret": client_secret,
      },
    });

    if (!result.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to check credits: ${JSON.stringify(result.data)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("inbox.dog MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
