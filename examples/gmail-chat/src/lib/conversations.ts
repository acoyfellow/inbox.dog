export const DEFAULT_CONVERSATION_ID = "default";

const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeConversationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!CONVERSATION_ID_RE.test(trimmed)) return null;
  return trimmed;
}

export function toConversationRoomName(userId: string, conversationId: string): string {
  if (!conversationId) return "";
  if (conversationId === DEFAULT_CONVERSATION_ID) return userId;
  return `${userId}__${conversationId}`;
}

export function conversationListStorageKey(userId: string): string {
  return `gmail-chat:conversations:${userId}`;
}

export function activeConversationStorageKey(userId: string): string {
  return `gmail-chat:active:${userId}`;
}

export function buildConversationTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "New conversation";
  return normalized.slice(0, 48);
}
