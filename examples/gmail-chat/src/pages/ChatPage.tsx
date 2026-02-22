import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
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
  if (!Array.isArray(input)) return [];
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
  const [openGlobalSidebarMenu, setOpenGlobalSidebarMenu] = useState(false);
  const [isConversationDrawerOpen, setIsConversationDrawerOpen] = useState(false);

  const sortedConversations = useMemo(
    () => sortConversations(conversations),
    [conversations],
  );

  useEffect(() => {
    if (!sortedConversations.some((x) => x.id === activeConversationId)) {
      setActiveConversationId(sortedConversations[0]?.id ?? "");
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
      if (target?.closest("[data-conversation-menu='true']") || target?.closest("[data-global-sidebar-menu='true']")) return;
      setOpenConversationMenuId(null);
      setOpenGlobalSidebarMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenConversationMenuId(null);
        setOpenGlobalSidebarMenu(false);
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
    const validId = activeConversationId && normalizeConversationId(activeConversationId);
    if (!validId || activeConversationId === DEFAULT_CONVERSATION_ID) {
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
          if (response.status === 409) {
            if (!cancelled) window.location.assign("/logout");
            return;
          }
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
    if (typeof window === "undefined") return;
    const conversation = conversations.find((x) => x.id === conversationId);
    if (!conversation) return;
    const confirmed = window.confirm(`Delete "${conversation.title}"?`);
    if (!confirmed) return;
    const remaining = sortConversations(
      conversations.filter((x) => x.id !== conversationId),
    );
    setConversations(remaining);
    if (activeConversationId === conversationId) {
      setActiveConversationId(remaining[0]?.id ?? "");
    }
    setOpenConversationMenuId(null);
  }, [conversations, activeConversationId]);

  const deleteAllConversations = useCallback(() => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm("Delete all conversations? This cannot be undone.");
    if (!confirmed) return;
    setConversations([]);
    setActiveConversationId("");
    setOpenConversationMenuId(null);
    setOpenGlobalSidebarMenu(false);
    setIsConversationDrawerOpen(false);
  }, []);

  const renderConversationList = () => {
    if (sortedConversations.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <p className="mb-4 text-base text-neutral-500 dark:text-neutral-400">
            No conversations yet
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={createConversation}
          >
            Start new conversation
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2 pb-3">
        {sortedConversations.map((conversation) => {
          const isActive = conversation.id === activeConversationId;
          return (
            <div
              key={conversation.id}
              className={`relative flex items-center rounded-md border border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950/70 dark:text-neutral-200 p-1`}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => markConversationActive(conversation.id)}
                className={`h-auto flex-1 justify-start px-3 py-3 text-left overflow-hidden hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  isActive
                    ? ""
                    : ""
                }`}
              >
                <span className="truncate text-base font-medium">{conversation.title}</span>
              </Button>
              <div className="relative shrink-0" data-conversation-menu="true">
                <Button
                  type="button"
                  aria-label={`Conversation actions for ${conversation.title}`}
                  shape="square"
                  variant="ghost"
                  onClick={() =>
                    setOpenConversationMenuId((prev) =>
                      prev === conversation.id ? null : conversation.id,
                    )
                  }
                  className={`p-3 text-base hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    isActive
                      ? ""
                      : ""
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="1.5"/>
                    <circle cx="12" cy="5" r="1.5"/>
                    <circle cx="12" cy="19" r="1.5"/>
                  </svg>
                </Button>
                {openConversationMenuId === conversation.id && (
                  <div className="absolute right-0 z-20 mt-1 w-32 rounded-md border border-neutral-300 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => renameConversation(conversation.id)}
                      className="h-auto w-full justify-start px-3 py-2.5 text-left text-base text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteConversation(conversation.id)}
                      className="h-auto w-full justify-start px-3 py-2.5 text-left text-base text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          {sortedConversations.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            shape="square"
            onClick={() => setIsConversationDrawerOpen(true)}
            aria-label="Open conversations"
            className="text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 md:hidden -ml-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </Button>
          )}
          <h1 className="text-lg font-medium">
            <span className="sr-only">chat.inbox.dog</span>
            <img src="https://inbox.dog/logo.svg" alt="chat.inbox.dog" className="h-6 w-auto dark:invert" />
          </h1>
          <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={createConversation}
              className="text-sm"
            >
              +
            </Button>
          {sortedConversations.length >= 1 && (
            <div className="relative" data-global-sidebar-menu="true">
              <Button
                type="button"
                aria-label="Sidebar actions"
                shape="square"
                variant="ghost"
                size="sm"
                onClick={() => setOpenGlobalSidebarMenu((prev) => !prev)}
                className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="1.5"/>
                  <circle cx="12" cy="5" r="1.5"/>
                  <circle cx="12" cy="19" r="1.5"/>
                </svg>
              </Button>
              {openGlobalSidebarMenu && (
                <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-md border border-neutral-300 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={deleteAllConversations}
                    className="h-auto w-full justify-start px-3 py-2.5 text-left text-base text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Delete All
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="/logout" className="rounded-md px-3 py-2 text-base text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300">
            Log out
          </a>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {sortedConversations.length > 0 && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/40 md:flex pt-3">
          {renderConversationList()}
        </aside>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          {sessionError && (
            <div className="shrink-0 border-b border-amber-300/70 bg-amber-50 px-4 py-2 text-base text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              {sessionError}
            </div>
          )}
          <div className="min-h-0 min-w-0 flex-1">
          <GmailChat
            userId={userId}
            conversationId={activeConversationId}
            conversationReady={!sessionSyncing}
            hasConversation={!!activeConversationId}
            onUserMessage={handleConversationMessage}
            onCreateConversation={createConversation}
          />
          </div>
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
            <div className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Conversations
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={createConversation}
                  className="text-xs"
                >
                  New
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  shape="square"
                  aria-label="Close"
                  onClick={() => setIsConversationDrawerOpen(false)}
                  className="p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </Button>
              </div>
            </div>
            {renderConversationList()}
          </aside>
        </div>
      )}
    </div>
  );
}
