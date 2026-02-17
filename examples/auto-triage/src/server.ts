/**
 * inbox.dog Auto-Triage — scheduled email triage agent
 *
 * Runs every 5 minutes. Classifies unread email with Workers AI,
 * then archives/labels via inbox.dog.
 *
 *   npx wrangler secret put GMAIL_ACCESS_TOKEN
 *   npx wrangler deploy
 */
import { Agent, routeAgentRequest } from "agents";
import { Gmail } from "inbox.dog";

interface Env {
  AI: Ai;
  GMAIL_ACCESS_TOKEN: string;
  GMAIL_REFRESH_TOKEN?: string;
  INBOX_DOG_CLIENT_ID?: string;
  INBOX_DOG_CLIENT_SECRET?: string;
  TriageAgent: DurableObjectNamespace;
}

type State = { lastRun: string | null; processed: number };
type Decision = { action: "archive" | "label" | "skip"; labels?: string[]; reason: string };

const RULES = `Classify this email. Respond with JSON only:
{ "action": "archive" | "label" | "skip", "labels": ["optional"], "reason": "one sentence" }

Rules:
- Marketing/newsletters/promos → archive
- Receipts/order confirmations → label "Receipts", archive
- GitHub notifications → label "GitHub", archive
- Emails from real humans needing a reply → skip
- Spam → archive`;

export class TriageAgent extends Agent<Env, State> {
  initialState: State = { lastRun: null, processed: 0 };

  async onStart() {
    const schedules = await this.getSchedules();
    if (schedules.length === 0) {
      this.schedule("*/5 * * * *", "triage");
    }
  }

  async triage() {
    const gmail = new Gmail({
      access_token: this.env.GMAIL_ACCESS_TOKEN,
      refresh_token: this.env.GMAIL_REFRESH_TOKEN,
      client_id: this.env.INBOX_DOG_CLIENT_ID,
      client_secret: this.env.INBOX_DOG_CLIENT_SECRET,
    });

    const { messages } = await gmail.list({ query: "is:unread", max: 20 });
    if (messages.length === 0) return;

    // resolve label names → IDs so the model can return human-readable names
    const allLabels = await gmail.labels();
    const labelMap = new Map(allLabels.map((l) => [l.name, l.id]));

    for (const email of messages) {
      const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct" as BaseAiTextGenerationModels, {
        messages: [
          { role: "user", content: `${RULES}\n\nFrom: ${email.from}\nSubject: ${email.subject}\nSnippet: ${email.snippet}` },
        ],
      });

      try {
        const text = "response" in response ? (response.response ?? "") : "";
        const decision: Decision = JSON.parse(text);

        if (decision.action === "skip") continue;

        if (decision.labels?.length) {
          const labelIds = decision.labels.map((name) => labelMap.get(name) ?? name);
          await gmail.addLabels(email.id, labelIds);
        }
        if (decision.action === "archive") {
          await gmail.archive(email.id);
        }
        await gmail.markRead(email.id);
      } catch {
        // skip emails that fail to classify
      }
    }

    this.setState({
      lastRun: new Date().toISOString(),
      processed: this.state.processed + messages.length,
    });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ?? Response.json({
      name: "auto-triage",
      status: "running",
      hint: "Agent runs on a 5-minute cron. POST to /agents/TriageAgent/default to wake it.",
    });
  },
} satisfies ExportedHandler<Env>;
