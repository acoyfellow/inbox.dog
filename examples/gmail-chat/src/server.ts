/**
 * Single Worker: routeAgentRequest for /agents/*, auth routes, then ASSETS.
 */
import { InboxDog, InboxDogError } from "inbox.dog";
import { routeAgentRequest } from "agents";
import { InboxAgent } from "./agent/index";
import { GmailBridge } from "./services/GmailBridge";
import { getCookie, setCookie, clearCookie } from "./lib/session";
import {
  DEFAULT_CONVERSATION_ID,
  normalizeConversationId,
  toConversationRoomName,
} from "./lib/conversations";

interface Env {
  INBOX_AGENT: DurableObjectNamespace;
  ASSETS: Fetcher;
  INBOX_DOG: Fetcher;
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
}

interface GmailSession {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  email: string;
}

export { InboxAgent, GmailBridge };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const agentRes = await routeAgentRequest(request, env, { cors: true });
    if (agentRes) return agentRes;

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/callback") {
      return handleCallback(request, env, url);
    }
    if (path === "/logout") {
      return handleLogout();
    }
    if (path === "/api/auth-url") {
      return handleAuthUrl(env, url);
    }
    if (path === "/api/me") {
      return handleMe(request);
    }
    if (path === "/api/chat/session" && request.method === "POST") {
      return handleEnsureConversationSession(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleCallback(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const cid = env.INBOX_DOG_CLIENT_ID;
  const csec = env.INBOX_DOG_CLIENT_SECRET;

  if (err || !code) {
    return redirect(`/?error=${encodeURIComponent(err ?? "invalid")}`);
  }
  if (!cid || !csec) {
    return redirect(`/?error=${encodeURIComponent("missing credentials")}`);
  }

  let t: { access_token: string; refresh_token: string; email: string };
  try {
    const dogFetch: typeof fetch = (input, init) => env.INBOX_DOG.fetch(input, init);
    t = await new InboxDog({ fetch: dogFetch }).exchangeCode(code, cid, csec);
  } catch (e) {
    if (e instanceof SyntaxError && e.message.includes("is not valid JSON")) {
      try {
        t = await new InboxDog().exchangeCode(code, cid, csec);
      } catch (e2) {
        const msg = e2 instanceof InboxDogError ? e2.message : e2 instanceof Error ? e2.message : "exchange failed";
        return redirect(`/?error=${encodeURIComponent(msg)}`);
      }
    } else {
      const msg = e instanceof InboxDogError ? e.message : e instanceof Error ? e.message : "exchange failed";
      return redirect(`/?error=${encodeURIComponent(msg)}`);
    }
  }

  const session = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    client_id: cid,
    client_secret: csec,
    email: t.email,
  };

  const userId = t.email.replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = env.INBOX_AGENT.idFromName(userId);
  const stub = env.INBOX_AGENT.get(id);
  await stub.fetch(
    new Request("http://localhost/session", {
      method: "PUT",
      body: JSON.stringify(session),
      headers: {
        "Content-Type": "application/json",
        "x-partykit-room": userId,
      },
    })
  );

  return new Response(null, {
    status: 302,
    headers: { Location: "/chat", "Set-Cookie": setCookie(userId) },
  });
}

async function handleLogout(): Promise<Response> {
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearCookie() },
  });
}

async function handleAuthUrl(env: Env, url: URL): Promise<Response> {
  const clientId = env.INBOX_DOG_CLIENT_ID;
  if (!clientId) {
    return Response.json(
      { error: "INBOX_DOG_CLIENT_ID not set" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const origin = url.origin;
  const authUrl = new InboxDog().getAuthUrl({
    clientId,
    redirectUri: `${origin}/callback`,
    scope: "email:read",
  });
  return Response.json({ authUrl });
}

async function handleEnsureConversationSession(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = getCookie(request);
  if (!userId) {
    return new Response(null, { status: 401 });
  }

  let body: { conversationId?: unknown };
  try {
    body = await request.json() as { conversationId?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const conversationId = normalizeConversationId(body.conversationId);
  if (!conversationId) {
    return Response.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const sourceRoom = toConversationRoomName(userId, DEFAULT_CONVERSATION_ID);
  const targetRoom = toConversationRoomName(userId, conversationId);

  if (sourceRoom === targetRoom) {
    return Response.json({ ok: true });
  }

  const targetStub = env.INBOX_AGENT.get(env.INBOX_AGENT.idFromName(targetRoom));
  const existingRes = await targetStub.fetch(
    new Request("http://localhost/session", {
      method: "GET",
      headers: { "x-partykit-room": targetRoom },
    }),
  );
  if (existingRes.ok) {
    return Response.json({ ok: true });
  }

  const sourceStub = env.INBOX_AGENT.get(env.INBOX_AGENT.idFromName(sourceRoom));
  const sourceRes = await sourceStub.fetch(
    new Request("http://localhost/session", {
      method: "GET",
      headers: { "x-partykit-room": sourceRoom },
    }),
  );
  if (!sourceRes.ok) {
    return Response.json(
      { error: "Gmail session not found. Reconnect your account." },
      { status: 409 },
    );
  }

  const session = await sourceRes.json() as GmailSession;

  const putRes = await targetStub.fetch(
    new Request("http://localhost/session", {
      method: "PUT",
      body: JSON.stringify(session),
      headers: {
        "Content-Type": "application/json",
        "x-partykit-room": targetRoom,
      },
    }),
  );

  if (!putRes.ok) {
    return Response.json(
      { error: "Failed to initialize conversation session" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}

function handleMe(request: Request): Response {
  const userId = getCookie(request);
  if (!userId) {
    return new Response(null, { status: 401 });
  }
  return Response.json({ userId: decodeURIComponent(userId) });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}
