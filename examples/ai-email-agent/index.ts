import { InboxDog } from "inbox.dog";
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, applyDecision, type Decision } from "./agent";

const dog = new InboxDog();
const anthropic = new Anthropic();

async function triage() {
  if (!process.env.INBOX_DOG_CLIENT_ID || !process.env.INBOX_DOG_CLIENT_SECRET) {
    throw new Error("Set INBOX_DOG_CLIENT_ID and INBOX_DOG_CLIENT_SECRET. Create a key at inbox.dog/connect, then Connect Gmail.");
  }
  const gmail = await dog.gmailFromKey(
    process.env.INBOX_DOG_CLIENT_ID,
    process.env.INBOX_DOG_CLIENT_SECRET,
  );
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
