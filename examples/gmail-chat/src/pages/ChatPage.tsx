import { useCallback, useEffect, useMemo, useState } from "react";
import GmailChat from "../components/GmailChat";
import { ThemeToggle } from "../components/ThemeToggle";
import {
  DEFAULT_CONVERSATION_ID,
  activeConversationStorageKey,
  buildConversationTitle,
  conversationListStorageKey,
  normalizeConversationId,
} from "../lib/conversations";

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
};

const DEFAULT_CONVERSATION: ConversationSummary = {
  id: DEFAULT_CONVERSATION_ID,
  title: "Inbox",
  updatedAt: 0,
};

function normalizeConversations(input: unknown): ConversationSummary[] {
  if (!Array.isArray(input)) return [DEFAULT_CONVERSATION];
  const next: ConversationSummary[] = [];
  for (const value of input) {
    const row = value as Partial<ConversationSummary>;
    const id = normalizeConversationId(row.id);
    if (!id) continue;
    const title = typeof row.title === "string" && row.title.trim()
      ? row.title.trim().slice(0, 64)
      : id === DEFAULT_CONVERSATION_ID
      ? DEFAULT_CONVERSATION.title
      : "New conversation";
    const updatedAt = typeof row.updatedAt === "number" ? row.updatedAt : 0;
    next.push({ id, title, updatedAt });
  }
  if (!next.some((x) => x.id === DEFAULT_CONVERSATION_ID)) {
    next.push(DEFAULT_CONVERSATION);
  }
  return next;
}

function sortConversations(items: ConversationSummary[]): ConversationSummary[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

function getInitialConversations(userId: string): ConversationSummary[] {
  if (typeof window === "undefined") return [DEFAULT_CONVERSATION];
  const raw = window.localStorage.getItem(conversationListStorageKey(userId));
  if (!raw) return [DEFAULT_CONVERSATION];
  try {
    return sortConversations(normalizeConversations(JSON.parse(raw)));
  } catch {
    return [DEFAULT_CONVERSATION];
  }
}

function getInitialActiveConversationId(userId: string): string {
  if (typeof window === "undefined") return DEFAULT_CONVERSATION_ID;
  const urlConversation = normalizeConversationId(
    new URLSearchParams(window.location.search).get("c"),
  );
  if (urlConversation) return urlConversation;
  const stored = normalizeConversationId(
    window.localStorage.getItem(activeConversationStorageKey(userId)),
  );
  return stored ?? DEFAULT_CONVERSATION_ID;
}

function createConversationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `c_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  }
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatPage({ userId }: { userId: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    () => getInitialConversations(userId),
  );
  const [activeConversationId, setActiveConversationId] = useState<string>(
    () => getInitialActiveConversationId(userId),
  );
  const [sessionSyncing, setSessionSyncing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
  const [isConversationDrawerOpen, setIsConversationDrawerOpen] = useState(false);

  const sortedConversations = useMemo(
    () => sortConversations(conversations),
    [conversations],
  );

  useEffect(() => {
    if (!sortedConversations.some((x) => x.id === activeConversationId)) {
      setActiveConversationId(DEFAULT_CONVERSATION_ID);
    }
  }, [sortedConversations, activeConversationId]);

  useEffect(() => {
    if (!openConversationMenuId) return;
    if (!sortedConversations.some((x) => x.id === openConversationMenuId)) {
      setOpenConversationMenuId(null);
    }
  }, [sortedConversations, openConversationMenuId]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-conversation-menu='true']")) return;
      setOpenConversationMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenConversationMenuId(null);
        setIsConversationDrawerOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      conversationListStorageKey(userId),
      JSON.stringify(sortedConversations),
    );
  }, [userId, sortedConversations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      activeConversationStorageKey(userId),
      activeConversationId,
    );
    const params = new URLSearchParams(window.location.search);
    if (activeConversationId === DEFAULT_CONVERSATION_ID) {
      params.delete("c");
    } else {
      params.set("c", activeConversationId);
    }
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [userId, activeConversationId]);

  useEffect(() => {
    let cancelled = false;
    if (activeConversationId === DEFAULT_CONVERSATION_ID) {
      setSessionError(null);
      setSessionSyncing(false);
      return;
    }

    setSessionSyncing(true);
    setSessionError(null);

    void (async () => {
      try {
        const response = await fetch("/api/chat/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeConversationId }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(
            () => ({ error: "Conversation setup failed" } as { error?: string }),
          ) as { error?: string };
          throw new Error(
            typeof payload.error === "string" ? payload.error : "Conversation setup failed",
          );
        }
        if (!cancelled) setSessionError(null);
      } catch (err) {
        if (!cancelled) {
          setSessionError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setSessionSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId]);

  const createConversation = useCallback(() => {
    const id = createConversationId();
    const now = Date.now();
    setConversations((prev) =>
      sortConversations([
        { id, title: "New conversation", updatedAt: now },
        ...prev.filter((x) => x.id !== id),
      ]),
    );
    setActiveConversationId(id);
    setOpenConversationMenuId(null);
    setIsConversationDrawerOpen(false);
  }, []);

  const markConversationActive = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setOpenConversationMenuId(null);
    setIsConversationDrawerOpen(false);
    setConversations((prev) =>
      prev.map((item) =>
        item.id === conversationId
          ? { ...item, updatedAt: Math.max(item.updatedAt, Date.now()) }
          : item,
      ),
    );
  }, []);

  const handleConversationMessage = useCallback(
    (text: string) => {
      const now = Date.now();
      setConversations((prev) =>
        prev.map((item) => {
          if (item.id !== activeConversationId) return item;
          const shouldSetTitle =
            item.id !== DEFAULT_CONVERSATION_ID && item.title === "New conversation";
          return {
            ...item,
            title: shouldSetTitle ? buildConversationTitle(text) : item.title,
            updatedAt: now,
          };
        }),
      );
    },
    [activeConversationId],
  );

  const renameConversation = useCallback((conversationId: string) => {
    const conversation = conversations.find((x) => x.id === conversationId);
    if (!conversation || typeof window === "undefined") return;
    const nextTitle = window.prompt("Rename conversation", conversation.title);
    if (nextTitle === null) return;
    const title = nextTitle.trim().slice(0, 64);
    if (!title) return;
    setConversations((prev) =>
      prev.map((item) =>
        item.id === conversationId
          ? { ...item, title, updatedAt: Math.max(item.updatedAt, Date.now()) }
          : item,
      ),
    );
    setOpenConversationMenuId(null);
  }, [conversations]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (conversationId === DEFAULT_CONVERSATION_ID || typeof window === "undefined") return;
    const conversation = conversations.find((x) => x.id === conversationId);
    if (!conversation) return;
    const confirmed = window.confirm(`Delete "${conversation.title}"?`);
    if (!confirmed) return;
    const remaining = sortConversations(
      conversations.filter((x) => x.id !== conversationId),
    );
    setConversations(remaining);
    if (activeConversationId === conversationId) {
      setActiveConversationId(remaining[0]?.id ?? DEFAULT_CONVERSATION_ID);
    }
    setOpenConversationMenuId(null);
  }, [conversations, activeConversationId]);

  const renderConversationList = () => (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
      {sortedConversations.map((conversation) => {
        const isActive = conversation.id === activeConversationId;
        const isDefault = conversation.id === DEFAULT_CONVERSATION_ID;
        return (
          <div
            key={conversation.id}
            className={`relative flex items-start gap-1 rounded-md border p-1 ${
              isActive
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950/70 dark:text-neutral-200"
            }`}
          >
            <button
              type="button"
              onClick={() => markConversationActive(conversation.id)}
              className={`flex-1 rounded px-2 py-1 text-left transition-colors ${
                isActive
                  ? "hover:bg-white/10 dark:hover:bg-neutral-900/10"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <div className="truncate text-sm font-medium">{conversation.title}</div>
              <div
                className={`mt-1 truncate text-xs ${
                  isActive
                    ? "text-white/80 dark:text-neutral-700"
                    : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {isDefault ? "Default conversation" : conversation.id}
              </div>
            </button>
            <div className="relative" data-conversation-menu="true">
              <button
                type="button"
                aria-label={`Conversation actions for ${conversation.title}`}
                onClick={() =>
                  setOpenConversationMenuId((prev) =>
                    prev === conversation.id ? null : conversation.id,
                  )
                }
                className={`rounded px-2 py-1 text-sm transition-colors ${
                  isActive
                    ? "text-white/80 hover:bg-white/10 hover:text-white dark:text-neutral-700 dark:hover:bg-neutral-900/10 dark:hover:text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                ...
              </button>
              {openConversationMenuId === conversation.id && (
                <div className="absolute right-0 z-20 mt-1 w-28 rounded-md border border-neutral-300 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  <button
                    type="button"
                    onClick={() => renameConversation(conversation.id)}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConversation(conversation.id)}
                    disabled={isDefault}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-base font-medium">Gmail Chat</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsConversationDrawerOpen(true)}
            className="rounded-md px-2 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 md:hidden"
          >
            Conversations
          </button>
          <ThemeToggle />
          <a href="/logout" className="rounded-md px-2 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300">
            Log out
          </a>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/40 md:flex">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Conversations
            </div>
            <button
              type="button"
              onClick={createConversation}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              New
            </button>
          </div>
          {renderConversationList()}
        </aside>
        <div className="min-h-0 flex-1">
          {sessionError && (
            <div className="border-b border-amber-300/70 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              {sessionError}
            </div>
          )}
          <GmailChat
            userId={userId}
            conversationId={activeConversationId}
            conversationReady={!sessionSyncing}
            onUserMessage={handleConversationMessage}
          />
        </div>
      </div>
      {isConversationDrawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close conversations drawer"
            onClick={() => setIsConversationDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Conversations
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={createConversation}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  New
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setIsConversationDrawerOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                >
                  x
                </button>
              </div>
            </div>
            {renderConversationList()}
          </aside>
        </div>
      )}
    </div>
  );
}
