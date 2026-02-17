import { Gmail } from "inbox.dog";
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, applyDecision, type Decision } from "./agent";

// inbox.dog handles Gmail OAuth — no Google Cloud console, no CASA audit
const gmail = new Gmail({
  access_token: process.env.GMAIL_ACCESS_TOKEN!,
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  client_id: process.env.INBOX_DOG_CLIENT_ID,
  client_secret: process.env.INBOX_DOG_CLIENT_SECRET,
});

const anthropic = new Anthropic();

// ── the agent loop ──────────────────────────────────────────────────────────

async function triage() {
  const { messages } = await gmail.list({ query: "is:unread", max: 20 });

  if (!messages.length) {
    console.log("Inbox zero. Nothing to do.");
    return;
  }

  console.log(`Processing ${messages.length} unread emails...`);

  const existingLabels = await gmail.labels();
  const labelMap = new Map(existingLabels.map((l) => [l.name, l.id]));

  for (const summary of messages) {
    const email = await gmail.get(summary.id);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: buildPrompt(email.from, email.subject, email.snippet) }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const decision: Decision = JSON.parse(text);

    console.log(
      `  ${email.from} — "${email.subject}" → ${decision.action} (${decision.reason})`
    );

    await applyDecision(gmail, email.id, decision, labelMap);
  }

  console.log("Done.");
}

triage();
