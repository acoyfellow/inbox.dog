import type { Gmail } from "inbox.dog";

// ── your rules, your inbox ──────────────────────────────────────────────────

export const RULES = `
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

// ── classify + act ──────────────────────────────────────────────────────────

export interface Decision {
  action: "archive" | "label" | "star" | "skip";
  labels?: string[];
  reason: string;
}

export function buildPrompt(from: string, subject: string, snippet: string) {
  return `${RULES}\n\nFrom: ${from}\nSubject: ${subject}\nSnippet: ${snippet}\n\nRespond with JSON only.`;
}

export async function applyDecision(
  gmail: Gmail,
  messageId: string,
  decision: Decision,
  labelMap: Map<string, string>,
) {
  // apply labels
  if (decision.labels?.length) {
    const labelIds = decision.labels.map(
      (name) => labelMap.get(name) ?? name,
    );
    await gmail.addLabels(messageId, labelIds);
  }

  // take action
  if (decision.action === "archive") {
    await gmail.archive(messageId);
  }

  await gmail.markRead(messageId);
}
