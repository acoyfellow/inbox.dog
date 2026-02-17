/**
 * inbox.dog Chat Agent — talk to your inbox in natural language
 *
 * "What's unread?" / "Archive all newsletters" / "Draft a reply to Alice"
 * Deployed as a Cloudflare Worker with Durable Object state.
 *
 *   npx wrangler secret put GMAIL_ACCESS_TOKEN
 *   npx wrangler secret put ANTHROPIC_API_KEY
 *   npx wrangler deploy
 */
import { AIChatAgent } from "agents/ai-chat-agent";
import { routeAgentRequest } from "agents";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { Gmail } from "inbox.dog";
import { z } from "zod";

interface Env {
  GMAIL_ACCESS_TOKEN: string;
  GMAIL_REFRESH_TOKEN?: string;
  INBOX_DOG_CLIENT_ID?: string;
  INBOX_DOG_CLIENT_SECRET?: string;
  ANTHROPIC_API_KEY: string;
  ChatAgent: DurableObjectNamespace;
}

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const gmail = new Gmail({
      access_token: this.env.GMAIL_ACCESS_TOKEN,
      refresh_token: this.env.GMAIL_REFRESH_TOKEN,
      client_id: this.env.INBOX_DOG_CLIENT_ID,
      client_secret: this.env.INBOX_DOG_CLIENT_SECRET,
    });

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

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
