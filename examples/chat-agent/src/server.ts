/**
 * inbox.dog Chat Agent — talk to your inbox in natural language
 *
 * Full e2e: Login with Google → chat with your email → deploy to Cloudflare
 *
 * inbox.dog handles Google OAuth + CASA audit. You get full Gmail access
 * without touching Google Cloud console. The API key is auto-provisioned
 * on first login — the only secret you need is ANTHROPIC_API_KEY.
 *
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
  ANTHROPIC_API_KEY: string;
  ChatAgent: DurableObjectNamespace;
}

type Tokens = { access_token: string; refresh_token: string };
type Credentials = { client_id: string; client_secret: string };
type AgentState = { tokens?: Tokens; credentials?: Credentials };

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

  /** Auto-provision an inbox.dog API key on first use, persist in DO state. */
  private async ensureCredentials(): Promise<Credentials> {
    if (this.state.credentials) return this.state.credentials;
    const dog = new InboxDog();
    const key = await dog.createKey("chat-agent");
    const credentials = { client_id: key.client_id, client_secret: key.client_secret };
    this.setState({ ...this.state, credentials });
    return credentials;
  }

  /** Handle /auth/* routes inside the DO so we have access to persistent state. */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/auth/login") {
      const creds = await this.ensureCredentials();
      const dog = new InboxDog();
      const authUrl = dog.getAuthUrl({
        clientId: creds.client_id,
        redirectUri: `${url.origin}/auth/callback`,
        scope: "email:full",
      });
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("Missing code", { status: 400 });
      const creds = await this.ensureCredentials();
      const dog = new InboxDog();
      const tokens = await dog.exchangeCode(code, creds.client_id, creds.client_secret);
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": tokenCookie({ access_token: tokens.access_token, refresh_token: tokens.refresh_token }),
        },
      });
    }

    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/", "Set-Cookie": clearCookie() },
      });
    }

    if (url.pathname === "/auth/status") {
      const tokens = tokensFromCookie(request.headers.get("cookie"));
      return Response.json({ authenticated: !!tokens });
    }

    return new Response("Not found", { status: 404 });
  }

  onConnect(connection: unknown, ctx: { request: Request }) {
    const tokens = tokensFromCookie(ctx.request.headers.get("cookie"));
    if (tokens) this.setState({ ...this.state, tokens });
  }

  async onChatMessage(onFinish: Parameters<AIChatAgent<Env, AgentState>["onChatMessage"]>[0]) {
    const tokens = this.state.tokens;
    if (!tokens) throw new Error("Not authenticated");

    const creds = await this.ensureCredentials();
    const gmail = new Gmail(
      { ...tokens, client_id: creds.client_id, client_secret: creds.client_secret },
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

// ── Worker fetch: route /auth/* to the DO, everything else to agents/assets ─

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Forward auth routes to the ChatAgent DO (which has persistent state for credentials)
    if (url.pathname.startsWith("/auth/")) {
      const id = env.ChatAgent.idFromName("default");
      return env.ChatAgent.get(id).fetch(request);
    }

    // Agent routes (WebSocket + API) and static assets
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
