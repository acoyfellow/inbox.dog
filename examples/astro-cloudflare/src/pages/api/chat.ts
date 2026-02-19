import type { APIRoute } from "astro";
import { InboxDog } from "inbox.dog";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionCookie, getSession } from "../../lib/session";

export const prerender = false;

export const POST = (async ({ request, locals }) => {
  const { env } = locals.runtime ?? {};
  const kv = env?.SESSIONS;
  const sessionId = getSessionCookie(request);
  const session = kv ? await getSession(kv, sessionId) : null;

  if (!session) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return new Response(
      JSON.stringify({ error: "Message required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const clientSecret = import.meta.env.INBOX_DOG_CLIENT_SECRET;
  const anthropicKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!clientSecret || !anthropicKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const dog = new InboxDog();
  const gmail = dog.gmail(
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
    session.client_id,
    session.client_secret,
  );

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let inboxContext = "";
  try {
    const { messages } = await gmail.list({ query: "is:unread", max: 10 });
    inboxContext = messages
      .map(
        (m) =>
          `- From: ${m.from} | Subject: ${m.subject} | Snippet: ${m.snippet?.slice(0, 80) ?? ""}...`,
      )
      .join("\n");
  } catch {
    inboxContext = "(Could not fetch inbox)";
  }

  const systemPrompt = `You are a helpful assistant with access to the user's Gmail. Reply concisely.

Recent unread emails:
${inboxContext}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: message }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return new Response(
    JSON.stringify({ reply: text }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}) satisfies APIRoute;
