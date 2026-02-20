import { useCallback, useMemo, useRef, useState } from "react";
import { isTextUIPart, isToolOrDynamicToolUIPart, type UIMessage } from "ai";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useAutoScroll } from "../lib/hooks";
import { toConversationRoomName } from "../lib/conversations";
import { ChatInput } from "./ChatInput";
import { ToolInvocation } from "./ToolInvocation";

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" ref={scrollRef}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`max-w-[85%] space-y-2 whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${
            msg.role === "user"
              ? "ml-auto bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
              : "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
          }`}
        >
          {msg.parts.map((part, index) => {
            const key = `${msg.id}-part-${index}`;
            if (isTextUIPart(part)) {
              return <div key={key}>{part.text}</div>;
            }
            if (isToolOrDynamicToolUIPart(part)) {
              return <ToolInvocation key={key} invocation={part} />;
            }
            return null;
          })}
        </div>
      ))}
      {isLoading && (
        <div className="max-w-[85%] rounded-lg bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500 dark:bg-neutral-900">
          ...
        </div>
      )}
      {errorView && (
        <div className="max-w-[85%] rounded-lg border border-red-400/50 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          <div className="font-medium">{errorView.title}</div>
          <div className="mt-1 text-red-100/90">{errorView.detail}</div>
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
  
  // Don't initialize agent when no conversation
  const agent = useAgent({
    agent: "inbox-agent",
    name: roomName,
    host,
  });

  const { messages, sendMessage, status, error, clearError } = useAgentChat({
    agent,
  });
  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";
  const inputDisabled = isLoading || !conversationReady;
  const errorView = formatChatError(error);
  const contextPercent = useMemo(() => estimateContextPercent(messages), [messages]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || inputDisabled) return;
      if (error) clearError();
      onUserMessage?.(text);
      void sendMessage({ text });
      setInput("");
    },
    [input, inputDisabled, sendMessage, error, clearError, onUserMessage]
  );

  if (!hasConversation || !roomName) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          No conversation selected
        </p>
        <button
          type="button"
          onClick={onCreateConversation}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Start new conversation
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!conversationReady && (
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">
          Preparing this conversation...
        </div>
      )}
      <MessageList messages={messages} isLoading={isLoading} errorView={errorView} />
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
