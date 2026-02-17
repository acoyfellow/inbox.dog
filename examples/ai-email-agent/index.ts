import { Gmail } from "inbox.dog";
import Anthropic from "@anthropic-ai/sdk";

// inbox.dog handles Gmail OAuth — no Google Cloud console, no CASA audit
const gmail = new Gmail({
  access_token: process.env.GMAIL_ACCESS_TOKEN!,
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  client_id: process.env.INBOX_DOG_CLIENT_ID,
  client_secret: process.env.INBOX_DOG_CLIENT_SECRET,
});

const anthropic = new Anthropic();

// ── your rules, your inbox ──────────────────────────────────────────────────

const RULES = `
You are an email triage agent. For each email, respond with a JSON object:
{
  "action": "archive" | "label" | "star" | "skip",
  "labels": ["optional label names to apply"],
  "reason": "one-sentence explanation"
}

Rules:
- Marketing, newsletters, and promotional emails → archive
- Receipts and order confirmations → label "Receipts", archive
- GitHub notifications → label "GitHub", archive
- Calendar invites and scheduling → skip (leave in inbox)
- Emails from real humans that need a response → skip (leave in inbox)
- Anything that looks like spam → archive
`;

// ── the agent loop ──────────────────────────────────────────────────────────

async function triage() {
  const { messages } = await gmail.list({ query: "is:unread", max: 20 });

  if (!messages.length) {
    console.log("Inbox zero. Nothing to do.");
    return;
  }

  console.log(`Processing ${messages.length} unread emails...`);

  // ensure custom labels exist
  const existingLabels = await gmail.labels();
  const labelMap = new Map(existingLabels.map((l) => [l.name, l.id]));

  for (const summary of messages) {
    const email = await gmail.get(summary.id);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `${RULES}\n\nFrom: ${email.from}\nSubject: ${email.subject}\nSnippet: ${email.snippet}\n\nRespond with JSON only.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const decision = JSON.parse(text);

    console.log(
      `  ${email.from} — "${email.subject}" → ${decision.action} (${decision.reason})`
    );

    // apply labels
    if (decision.labels?.length) {
      const labelIds = decision.labels.map(
        (name: string) => labelMap.get(name) ?? name
      );
      await gmail.addLabels(email.id, labelIds);
    }

    // take action
    if (decision.action === "archive") {
      await gmail.archive(email.id);
    }

    await gmail.markRead(email.id);
  }

  console.log("Done.");
}

triage();
