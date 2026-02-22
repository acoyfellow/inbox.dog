import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTextUIPart, type UIMessage } from "ai";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useAutoScroll } from "../lib/hooks";
import { toConversationRoomName } from "../lib/conversations";
import { ChatInput } from "./ChatInput";

const ERROR_STORAGE_KEY_PREFIX = "gmail-chat:last-error:";

function getStoredError(roomName: string): ChatErrorView & { messageCount: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ERROR_STORAGE_KEY_PREFIX + roomName);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { title: string; detail: string; messageCount: number };
    return parsed.title && parsed.detail && typeof parsed.messageCount === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function setStoredError(roomName: string, view: ChatErrorView, messageCount: number): void {
  try {
    sessionStorage.setItem(ERROR_STORAGE_KEY_PREFIX + roomName, JSON.stringify({ ...view, messageCount }));
  } catch {
    // ignore
  }
}

function clearStoredError(roomName: string): void {
  try {
    sessionStorage.removeItem(ERROR_STORAGE_KEY_PREFIX + roomName);
  } catch {
    // ignore
  }
}

interface GmailChatProps {
  userId: string;
  conversationId: string;
  conversationReady: boolean;
  hasConversation: boolean;
  onUserMessage?: (text: string) => void;
  onCreateConversation?: () => void;
}

type ChatErrorView = {
  title: string;
  detail: string;
};

const MODEL_CONTEXT_WINDOW_TOKENS = 128_000;

const GETTING_STARTED_PROMPTS = [
  "How many unread emails do I have?",
  "Summarize my last 5 emails",
  "What needs my attention? Show unread from the last 3 days.",
  "Find emails I haven't replied to this week",
  "List my most recent inbox with senders and subjects",
  "Do I have any starred emails?",
];

function estimateContextPercent(messages: UIMessage[]): number {
  const estimatedChars = messages.reduce((total, message) => {
    return total + message.parts.reduce((partTotal, part) => {
      if (isTextUIPart(part)) {
        return partTotal + part.text.length;
      }
      try {
        return partTotal + JSON.stringify(part).length;
      } catch {
        return partTotal;
      }
    }, 0);
  }, 0);

  const estimatedTokens = Math.ceil(estimatedChars / 4);
  return Math.min(100, (estimatedTokens / MODEL_CONTEXT_WINDOW_TOKENS) * 100);
}

export function formatChatError(error: Error | undefined): ChatErrorView | null {
  if (!error) return null;
  const message = typeof error.message === "string" ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("credit balance is too low")
    || lower.includes("quota")
    || lower.includes("insufficient")
    || lower.includes("workers ai")
    || lower.includes("neurons")
  ) {
    return {
      title: "Cloudflare AI quota or billing issue",
      detail: `Chat failed because Workers AI rejected the request: ${message}`,
    };
  }

  return {
    title: "Chat request failed",
    detail: message,
  };
}

function hasContent(msg: UIMessage): boolean {
  return msg.parts.some((part) => isTextUIPart(part) && part.text.length > 0);
}

function BouncingDots() {
  return (
    <div className="flex h-5 items-center gap-1.5 px-1">
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500" style={{ animationDelay: "0ms" }} />
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500" style={{ animationDelay: "150ms" }} />
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

function MessageList({
  messages,
  isLoading,
  errorView,
}: {
  messages: UIMessage[];
  isLoading: boolean;
  errorView: ChatErrorView | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoScroll(scrollRef, [messages, isLoading, errorView?.detail]);

  // Hide empty assistant messages (like those that only contain hidden tool calls)
  const visibleMessages = messages.filter((msg) => msg.role !== "assistant" || hasContent(msg));

  // Show thinking indicator if loading AND the agent isn't actively streaming text.
  // If the last actual part in the raw messages array is a tool call, the agent is thinking/executing.
  const lastRawMsg = messages[messages.length - 1];
  const lastRawPart = lastRawMsg?.parts[lastRawMsg.parts.length - 1];
  const isToolExecuting = isLoading && (!lastRawMsg || lastRawMsg.role === "user" || (lastRawPart && !isTextUIPart(lastRawPart)));

  const lastVisibleIsError = visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].parts.some(p => isTextUIPart(p) && p.text.startsWith("[SYSTEM_ERROR] "));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4" ref={scrollRef}>
      {visibleMessages.map((msg) => {
        const textPart = msg.parts.find(isTextUIPart);
        if (msg.role === "assistant" && textPart && textPart.text.startsWith("[SYSTEM_ERROR] ")) {
          const errorMsg = textPart.text.replace("[SYSTEM_ERROR] ", "");
          const fakeErrorView = formatChatError(new Error(errorMsg));
          return (
            <div
              key={msg.id}
              className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-400/50 dark:bg-red-950/40 dark:text-red-100"
            >
              <div className="font-medium">{fakeErrorView?.title || "Chat request failed"}</div>
              <div className="mt-1 text-sm text-red-800 dark:text-red-100/90">{fakeErrorView?.detail || errorMsg}</div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`w-full max-w-[85%] min-w-0 shrink-0 space-y-2 overflow-hidden whitespace-pre-wrap break-words rounded-2xl px-5 py-3 text-base ${
              msg.role === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
            }`}
          >
            {msg.parts.map((part, index) => {
              const key = `${msg.id}-part-${index}`;
              if (isTextUIPart(part)) {
                return <div key={key} className="overflow-hidden break-words" data-message-part="text">{part.text}</div>;
              }
              // We do NOT render tool parts anymore.
              return null;
            })}
          </div>
        );
      })}
      
      {isToolExecuting && (
        <div className="w-fit max-w-[85%] rounded-2xl bg-neutral-100 px-5 py-3 text-base dark:bg-neutral-800">
          <BouncingDots />
        </div>
      )}
      
      {errorView && !lastVisibleIsError && (
        <div className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-400/50 dark:bg-red-950/40 dark:text-red-100">
          <div className="font-medium">{errorView.title}</div>
          <div className="mt-1 text-sm text-red-800 dark:text-red-100/90">{errorView.detail}</div>
        </div>
      )}
    </div>
  );
}

export function GmailChat({
  userId,
  conversationId,
  conversationReady,
  hasConversation,
  onUserMessage,
  onCreateConversation,
}: GmailChatProps) {
  const host = typeof window !== "undefined" ? window.location.origin : "";
  const roomName = toConversationRoomName(userId, conversationId);
  const [hasAttemptedSend, setHasAttemptedSend] = useState(false);
  
  const agent = useAgent({
    agent: "inbox-agent",
    name: roomName,
    host,
  });

  const { messages, sendMessage, status, error, clearError } = useAgentChat({
    agent,
  });
  const [input, setInput] = useState("");
  useEffect(() => {
    if (!error) return;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("no refresh token available")) {
      window.location.assign("/logout");
    }
  }, [error]);
  const [persistedErrorView, setPersistedErrorView] = useState<ChatErrorView | null>(null);
  const isLoading = status === "submitted" || status === "streaming";
  const liveErrorView = useMemo(
    () => (hasAttemptedSend ? formatChatError(error) : null),
    [hasAttemptedSend, error]
  );

  useEffect(() => {
    if (liveErrorView && messages.length > 0) {
      setStoredError(roomName, liveErrorView, messages.length);
      setPersistedErrorView(liveErrorView);
    }
  }, [liveErrorView, messages.length, roomName]);

  useEffect(() => {
    if (!conversationReady || messages.length === 0) return;
    const lastIsUser = messages[messages.length - 1]?.role === "user";
    if (lastIsUser) {
      const stored = getStoredError(roomName);
      if (stored && stored.messageCount === messages.length)
        setPersistedErrorView({ title: stored.title, detail: stored.detail });
    } else {
      clearStoredError(roomName);
      setPersistedErrorView(null);
    }
  }, [conversationReady, roomName, messages.length, messages[messages.length - 1]?.role]);

  const errorView = liveErrorView ?? (messages.length > 0 && messages[messages.length - 1]?.role === "user" ? persistedErrorView : null);
  const contextPercent = useMemo(() => estimateContextPercent(messages), [messages]);
  const inputDisabled = isLoading || !conversationReady;

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || inputDisabled) return;
      setHasAttemptedSend(true);
      if (error) clearError();
      clearStoredError(roomName);
      setPersistedErrorView(null);
      onUserMessage?.(text);
      void sendMessage({ text });
      setInput("");
    },
    [input, inputDisabled, sendMessage, error, clearError, onUserMessage, roomName]
  );

  const handlePromptClick = useCallback(
    (text: string) => {
      if (inputDisabled) return;
      setHasAttemptedSend(true);
      if (error) clearError();
      clearStoredError(roomName);
      setPersistedErrorView(null);
      onUserMessage?.(text);
      void sendMessage({ text });
    },
    [inputDisabled, sendMessage, error, clearError, onUserMessage, roomName]
  );

  if (!hasConversation || !roomName) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
        <p className="mb-4 text-base text-neutral-500 dark:text-neutral-400">
          No conversation selected
        </p>
        <button
          type="button"
          onClick={onCreateConversation}
          className="rounded-md bg-neutral-900 px-4 py-2 text-base text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Start new conversation
        </button>
      </div>
    );
  }

  const showGettingStarted = messages.length === 0 && conversationReady && !isLoading;

  return (
    <div className="flex h-full min-w-0 flex-col">
      {!conversationReady && (
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">
          Preparing this conversation...
        </div>
      )}
      {showGettingStarted ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6">
            <p className="text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Try one of these
            </p>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {GETTING_STARTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-700 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:shadow dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isLoading={isLoading} errorView={errorView} />
      )}
      <ChatInput
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={handleSubmit}
        disabled={inputDisabled}
        contextPercent={contextPercent}
      />
    </div>
  );
}

export default GmailChat;
