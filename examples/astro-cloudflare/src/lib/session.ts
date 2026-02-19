/** Session helpers using KV. Runtime must have SESSIONS binding. */

export interface SessionData {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  email: string;
  expires_at?: number;
}

const COOKIE_NAME = "inbox_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export function getSessionCookie(req: Request): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function createSetCookieHeader(sessionId: string, maxAge: number): string {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function createClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string | null,
): Promise<SessionData | null> {
  if (!sessionId) return null;
  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function setSession(
  kv: KVNamespace,
  sessionId: string,
  data: SessionData,
): Promise<void> {
  await kv.put(`session:${sessionId}`, JSON.stringify(data), {
    expirationTtl: SESSION_TTL,
  });
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<void> {
  await kv.delete(`session:${sessionId}`);
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}
