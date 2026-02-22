/**
 * Single Worker: routeAgentRequest for /agents/*, auth routes, then ASSETS.
 */
import { InboxDog } from "inbox.dog";
import { routeAgentRequest } from "agents";
import { InboxAgent } from "./agent/index";
import { getCookie, setCookie, clearCookie } from "./lib/session";
import { createGmailTools } from "./agent/gmail-tools";
import {
  DEFAULT_CONVERSATION_ID,
  normalizeConversationId,
  toConversationRoomName,
} from "./lib/conversations";

interface Env {
  INBOX_AGENT: DurableObjectNamespace;
  ASSETS: Fetcher;
  INBOX_DOG: Fetcher;
  LOADER: WorkerLoader;
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
  /** Set in dev/.dev.vars for E2E; required for POST /api/test/inject-session */
  TEST_INJECT_SECRET?: string;
}

interface GmailSession {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  email: string;
}

export { InboxAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle auth and API routes first so our code runs and we can log
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
    
    // DEV BACKDOOR for testing endpoints directly against active session (guarded so prod without TEST_INJECT_SECRET has no access)
    if (path === "/api/dev/exec" && request.method === "POST" && env.TEST_INJECT_SECRET) {
      try {
        const body = await request.json() as { userId: string, code: string };
        const id = env.INBOX_AGENT.idFromName(body.userId);
        const stub = env.INBOX_AGENT.get(id);
        const sessionRes = await stub.fetch(
          new Request("http://localhost/session", {
            method: "GET",
            headers: { "x-partykit-room": body.userId },
          })
        );
        if (!sessionRes.ok) return new Response("No session", { status: 404 });
        const session = await sessionRes.json() as GmailSession;
        if (!session.access_token) return new Response("No token", { status: 401 });
        
        let token = session.access_token;
        const testRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` } });
        if (testRes.status === 401 && session.refresh_token) {
          const dog = new InboxDog();
          const refreshed = await dog.refreshToken(session.refresh_token, session.client_id, session.client_secret);
          token = refreshed.access_token;
        }

        const gmailTools = createGmailTools(token);
        const { DynamicWorkerExecutor } = await import("@cloudflare/codemode");
        const { createCodeTool } = await import("@cloudflare/codemode/ai");
        const executor = new DynamicWorkerExecutor({ loader: env.LOADER });
        const codemodeInner = createCodeTool({ tools: gmailTools, executor }) as unknown as { execute: (x: { code: string }) => Promise<unknown> };
        const res = await codemodeInner.execute({ code: body.code });
        return Response.json({ success: true, result: res });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }
    if (path === "/api/validate-tokens") {
      return handleValidateTokens(request, env);
    }
    if (path === "/api/chat/session" && request.method === "POST") {
      return handleEnsureConversationSession(request, env);
    }
    if (path === "/api/test/inject-session" && request.method === "POST" && env.TEST_INJECT_SECRET) {
      return handleTestInjectSession(request, env);
    }

    const agentRes = await routeAgentRequest(request, env, { cors: true });
    if (agentRes) return agentRes;
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

  // Token exchange: use global fetch so we never touch a service binding Response
  // (reading .body or calling .json()/.text() on a binding Response can cause "Illegal invocation").
  const tokenRes = await fetch("https://inbox.dog/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: cid,
      client_secret: csec,
    }),
  });
  const rawBody = await tokenRes.text();
  if (!tokenRes.ok) {
    const errBody = rawBody ? (JSON.parse(rawBody) as { error?: { message?: string } }) : {};
    return redirect(`/?error=${encodeURIComponent(errBody.error?.message ?? `HTTP ${tokenRes.status}`)}`);
  }
  const t = JSON.parse(rawBody) as { access_token: string; refresh_token: string; email: string };

  const userId = t.email.replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = env.INBOX_AGENT.idFromName(userId);
  const stub = env.INBOX_AGENT.get(id);

  // Preserve existing refresh token if Google didn't issue a new one
  let existingRefreshToken: string | undefined;
  try {
    const existingRes = await stub.fetch(
      new Request("http://localhost/session", {
        method: "GET",
        headers: { "x-partykit-room": userId },
      })
    );
    if (existingRes.ok) {
      const existingSession = await existingRes.json() as GmailSession;
      existingRefreshToken = existingSession.refresh_token;
    }
  } catch (e) {
    console.error("[auth] Failed to read existing session", e);
    throw e; // Do not swallow the error per user rules
  }

  const session = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || existingRefreshToken,
    client_id: cid,
    client_secret: csec,
    email: t.email,
  };

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

const E2E_TEST_USER_ID = "test-e2e";

async function handleTestInjectSession(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("x-test-secret") !== env.TEST_INJECT_SECRET) {
    return new Response(null, { status: 401 });
  }
  let session: GmailSession;
  try {
    session = (await request.json()) as GmailSession;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const stub = env.INBOX_AGENT.get(env.INBOX_AGENT.idFromName(E2E_TEST_USER_ID));
  const putRes = await stub.fetch(
    new Request("http://localhost/session", {
      method: "PUT",
      body: JSON.stringify(session),
      headers: {
        "Content-Type": "application/json",
        "x-partykit-room": E2E_TEST_USER_ID,
      },
    }),
  );
  if (!putRes.ok) {
    return Response.json({ error: "Failed to put session" }, { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setCookie(E2E_TEST_USER_ID),
    },
  });
}

async function handleAuthUrl(env: Env, url: URL): Promise<Response> {
  try {
    const clientId = env.INBOX_DOG_CLIENT_ID;
    if (!clientId) {
      const msg = "INBOX_DOG_CLIENT_ID not set (add to .dev.vars or wrangler secret)";
      console.warn("[auth-url] 500:", msg);
      return Response.json(
        { error: msg },
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const origin = url.origin;
    const authUrl = new InboxDog({ fetch: globalThis.fetch.bind(globalThis) }).getAuthUrl({
      clientId,
      redirectUri: `${origin}/callback`,
      scope: "email:full",
    });
    // Append prompt=consent and access_type=offline to force Google to issue a new refresh_token
    // even if the user previously authorized. This prevents "no refresh token available" errors
    // when local DO storage is cleared.
    const finalAuthUrl = authUrl.includes("?") 
      ? `${authUrl}&prompt=consent&access_type=offline` 
      : `${authUrl}?prompt=consent&access_type=offline`;
    return Response.json({ authUrl: finalAuthUrl });
  } catch (e) {
    console.warn("[auth-url] 500:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to build auth URL" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
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
  
  // We should ALWAYS sync the latest session from the source room 
  // because the source room gets its tokens refreshed by /api/validate-tokens
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

async function handleValidateTokens(request: Request, env: Env): Promise<Response> {
  const userId = getCookie(request);
  if (!userId) {
    return Response.json({ valid: false, error: "Not logged in" }, { status: 401 });
  }

  const id = env.INBOX_AGENT.idFromName(userId);
  const stub = env.INBOX_AGENT.get(id);
  const sessionRes = await stub.fetch(
    new Request("http://localhost/session", {
      method: "GET",
      headers: { "x-partykit-room": userId },
    }),
  );

  if (!sessionRes.ok) {
    return Response.json({ valid: false, error: "No session found" });
  }

  const session = (await sessionRes.json()) as GmailSession;
  if (!session.access_token) {
    return Response.json({ valid: false, error: "No access token" });
  }

  // Test the token against Gmail, auto-refresh if expired
  try {
    let token = session.access_token;
    let gmailRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // Auto-refresh on 401
    if (gmailRes.status === 401 && session.refresh_token) {
      try {
        const dog = new InboxDog({ fetch: globalThis.fetch.bind(globalThis) });
        const refreshed = await dog.refreshToken(
          session.refresh_token,
          session.client_id,
          session.client_secret,
        );
        token = refreshed.access_token;
        // Persist refreshed token back to the DO
        await stub.fetch(
          new Request("http://localhost/session", {
            method: "PUT",
            body: JSON.stringify({ ...session, access_token: token }),
            headers: {
              "Content-Type": "application/json",
              "x-partykit-room": userId,
            },
          }),
        );
        // Retry with new token
        gmailRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } catch {
        return Response.json({
          valid: false,
          error: "Token expired and refresh failed. Please reconnect.",
        });
      }
    }

    if (gmailRes.ok) {
      const profile = (await gmailRes.json()) as { emailAddress: string };
      return Response.json({ valid: true, email: profile.emailAddress });
    }
    return Response.json({
      valid: false,
      error: `Gmail API returned ${gmailRes.status}`,
      status: gmailRes.status,
    });
  } catch (e) {
    return Response.json({
      valid: false,
      error: e instanceof Error ? e.message : "Token validation failed",
    });
  }
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
