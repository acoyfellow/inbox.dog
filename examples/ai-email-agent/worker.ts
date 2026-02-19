import { InboxDog } from "inbox.dog";
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, applyDecision, type Decision } from "./agent";

export interface Env {
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
}

async function triage(env: Env): Promise<{ processed: number; log: string[] }> {
  const log: string[] = [];
  if (!env.INBOX_DOG_CLIENT_ID || !env.INBOX_DOG_CLIENT_SECRET) {
    throw new Error("Set INBOX_DOG_CLIENT_ID and INBOX_DOG_CLIENT_SECRET. Create a key at inbox.dog/connect, then Connect Gmail.");
  }
  const dog = new InboxDog({
    fetch: (url, init) => fetch(url, init),
  });
  const gmail = await dog.gmailFromKey(env.INBOX_DOG_CLIENT_ID, env.INBOX_DOG_CLIENT_SECRET);
 
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const { messages } = await gmail.list({ query: "is:unread", max: 20 });

  if (!messages.length) {
    log.push("Inbox zero. Nothing to do.");
    return { processed: 0, log };
  }

  log.push(`Processing ${messages.length} unread emails...`);
  const existingLabels = await gmail.labels();
  const labelMap = new Map(existingLabels.map((l) => [l.name, l.id]));

  for (const summary of messages) {
    const email = await gmail.get(summary.id);
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: buildPrompt(email.from, email.subject, email.snippet) }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const decision: Decision = JSON.parse(text);
    log.push(`  ${email.from} — "${email.subject}" → ${decision.action} (${decision.reason})`);
    await applyDecision(gmail, email.id, decision, labelMap);
  }

  log.push("Done.");
  return { processed: messages.length, log };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    try {
      const result = await triage(env);
      return Response.json(result);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      return Response.json({ error: msg }, { status: 500 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      triage(env).then((r) => console.log(r.log.join("\n"))).catch((e) => console.error(e))
    );
  },
};
