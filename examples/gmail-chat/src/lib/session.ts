export const SESSION_COOKIE = "inbox_session";
const TTL = 604800; // 7d

/** Cookie value is the userId (email) used to derive the DO id. */
export function getCookie(r: Request): string | null {
  return r.headers.get("Cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] ?? null;
}

export function setCookie(userId: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
