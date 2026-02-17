/**
 * inbox.dog MCP Server — expose Gmail as tools for any MCP client
 *
 * Connect from Claude Desktop, Cursor, or any MCP-compatible agent.
 * Stateless Cloudflare Worker, no Durable Objects needed.
 *
 * Auth: MCP transport handles its own auth via OAuth or token headers.
 * For production, add Cloudflare Access or a bearer-token check in fetch().
 *
 *   npx wrangler secret put GMAIL_ACCESS_TOKEN
 *   npx wrangler deploy
 */
import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Gmail } from "inbox.dog";
import { z } from "zod";

interface Env {
  GMAIL_ACCESS_TOKEN: string;
  GMAIL_REFRESH_TOKEN?: string;
  INBOX_DOG_CLIENT_ID?: string;
  INBOX_DOG_CLIENT_SECRET?: string;
}

function createServer(env: Env) {
  const server = new McpServer({ name: "inbox.dog", version: "1.0.0" });
  const gmail = new Gmail({
    access_token: env.GMAIL_ACCESS_TOKEN,
    refresh_token: env.GMAIL_REFRESH_TOKEN,
    client_id: env.INBOX_DOG_CLIENT_ID,
    client_secret: env.INBOX_DOG_CLIENT_SECRET,
  });

  server.tool("list_emails", { query: z.string().optional(), max: z.number().default(10) },
    async ({ query, max }) => {
      const { messages } = await gmail.list({ query, max });
      return { content: [{ type: "text" as const, text: JSON.stringify(messages, null, 2) }] };
    },
  );

  server.tool("read_email", { id: z.string() },
    async ({ id }) => {
      const email = await gmail.get(id);
      return { content: [{ type: "text" as const, text: JSON.stringify(email, null, 2) }] };
    },
  );

  server.tool("search_emails", { query: z.string(), max: z.number().default(10) },
    async ({ query, max }) => {
      const { messages } = await gmail.search(query, { max });
      return { content: [{ type: "text" as const, text: JSON.stringify(messages, null, 2) }] };
    },
  );

  server.tool("send_email", { to: z.string(), subject: z.string(), body: z.string(), threadId: z.string().optional() },
    async (args) => {
      const result = await gmail.send(args);
      return { content: [{ type: "text" as const, text: `Sent: ${result.id}` }] };
    },
  );

  server.tool("archive", { ids: z.array(z.string()) },
    async ({ ids }) => {
      await gmail.archive(ids);
      return { content: [{ type: "text" as const, text: `Archived ${ids.length} message(s)` }] };
    },
  );

  server.tool("label", { ids: z.array(z.string()), labelIds: z.array(z.string()) },
    async ({ ids, labelIds }) => {
      await gmail.addLabels(ids, labelIds);
      return { content: [{ type: "text" as const, text: `Labeled ${ids.length} message(s)` }] };
    },
  );

  server.tool("trash", { ids: z.array(z.string()) },
    async ({ ids }) => {
      await gmail.trash(ids);
      return { content: [{ type: "text" as const, text: `Trashed ${ids.length} message(s)` }] };
    },
  );

  return server;
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    createMcpHandler(createServer(env))(request, env, ctx),
};
