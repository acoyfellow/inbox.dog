/**
 * inbox.dog Chat Agent — talk to your inbox in natural language
 *
 * Full e2e: Login with Google → chat with your email → deploy to Cloudflare
 *
 *   npx wrangler secret put INBOX_DOG_CLIENT_ID
 *   npx wrangler secret put INBOX_DOG_CLIENT_SECRET
 *   npx wrangler secret put ANTHROPIC_API_KEY
 *   npx wrangler deploy
 */
import { AIChatAgent } from "agents/ai-chat-agent";
import { routeAgentRequest } from "agents";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { InboxDog, Gmail } from "inbox.dog";
import { z } from "zod";

interface Env {
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ChatAgent: DurableObjectNamespace;
}

type Tokens = { access_token: string; refresh_token: string };
type AgentState = { tokens?: Tokens };

// ── Cookie helpers ──────────────────────────────────────────────────────────

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function tokenCookie(tokens: Tokens): string {
  const val = btoa(JSON.stringify(tokens));
  return `tokens=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}

function clearCookie(): string {
  return "tokens=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function tokensFromCookie(header: string | null): Tokens | undefined {
  const raw = parseCookie(header, "tokens");
  if (!raw) return;
  try {
    return JSON.parse(atob(raw));
  } catch {
    return;
  }
}

// ── Chat Agent ──────────────────────────────────────────────────────────────

export class ChatAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {};

  onConnect(connection: unknown, ctx: { request: Request }) {
    const tokens = tokensFromCookie(ctx.request.headers.get("cookie"));
    if (tokens) this.setState({ tokens });
  }

  async onChatMessage(onFinish: Parameters<AIChatAgent<Env, AgentState>["onChatMessage"]>[0]) {
    const tokens = this.state.tokens;
    if (!tokens) throw new Error("Not authenticated");

    const gmail = new Gmail(
      { ...tokens, client_id: this.env.INBOX_DOG_CLIENT_ID, client_secret: this.env.INBOX_DOG_CLIENT_SECRET },
      { autoRefresh: true },
    );
    const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });

    const result = streamText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: "You manage the user's Gmail inbox. Use tools to read, search, send, archive, and label emails. Be concise.",
      messages: this.messages,
      tools: {
        list_emails: tool({
          description: "List emails. Use query for Gmail search syntax (e.g. is:unread, from:alice).",
          parameters: z.object({ query: z.string().optional(), max: z.number().default(10) }),
          execute: async ({ query, max }) => gmail.list({ query, max }),
        }),
        read_email: tool({
          description: "Get full email content by ID.",
          parameters: z.object({ id: z.string() }),
          execute: async ({ id }) => gmail.get(id),
        }),
        send_email: tool({
          description: "Send an email.",
          parameters: z.object({ to: z.string(), subject: z.string(), body: z.string(), threadId: z.string().optional() }),
          execute: async (args) => gmail.send(args),
        }),
        archive: tool({
          description: "Archive emails by ID.",
          parameters: z.object({ ids: z.array(z.string()) }),
          execute: async ({ ids }) => { await gmail.archive(ids); return { archived: ids.length }; },
        }),
        label: tool({
          description: "Add labels to emails.",
          parameters: z.object({ ids: z.array(z.string()), labelIds: z.array(z.string()) }),
          execute: async ({ ids, labelIds }) => { await gmail.addLabels(ids, labelIds); return { labeled: ids.length }; },
        }),
        list_labels: tool({
          description: "List all Gmail labels.",
          parameters: z.object({}),
          execute: async () => gmail.labels(),
        }),
      },
    });

    return result.toUIMessageStreamResponse({ onFinish });
  }
}

// ── Worker fetch: OAuth routes + agent routing ──────────────────────────────

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const dog = new InboxDog();

    // Login: redirect to inbox.dog OAuth
    if (url.pathname === "/auth/login") {
      const authUrl = dog.getAuthUrl({
        clientId: env.INBOX_DOG_CLIENT_ID,
        redirectUri: `${url.origin}/auth/callback`,
        scope: "email:full",
      });
      return Response.redirect(authUrl, 302);
    }

    // Callback: exchange code for tokens, set cookie
    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("Missing code", { status: 400 });

      const tokens = await dog.exchangeCode(code, env.INBOX_DOG_CLIENT_ID, env.INBOX_DOG_CLIENT_SECRET);
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": tokenCookie({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }),
        },
      });
    }

    // Logout: clear cookie
    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/", "Set-Cookie": clearCookie() },
      });
    }

    // Auth status: let the frontend know if user is logged in
    if (url.pathname === "/auth/status") {
      const tokens = tokensFromCookie(request.headers.get("cookie"));
      return Response.json({ authenticated: !!tokens });
    }

    // Agent routes (WebSocket + API)
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
