import { useCallback, useRef, useState } from "react";
import { isTextUIPart, isToolOrDynamicToolUIPart, type UIMessage } from "ai";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useAutoScroll } from "../lib/hooks";
import { ChatInput } from "./ChatInput";
import { ToolInvocation } from "./ToolInvocation";

interface GmailChatProps {
  userId: string;
}

type ChatErrorView = {
  title: string;
  detail: string;
};

export function formatChatError(error: Error | undefined): ChatErrorView | null {
  if (!error) return null;
  const message = typeof error.message === "string" ? error.message : String(error);

  if (message.toLowerCase().includes("credit balance is too low")) {
    return {
      title: "Anthropic credits exhausted",
      detail: "This app cannot chat because the configured ANTHROPIC_API_KEY is out of credits. Add Anthropic credits or set a new key in Worker secrets.",
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

export function GmailChat({ userId }: GmailChatProps) {
  const host = typeof window !== "undefined" ? window.location.origin : "";
  const agent = useAgent({
    agent: "inbox-agent",
    name: userId,
    host,
  });

  const { messages, sendMessage, status, error, clearError } = useAgentChat({
    agent,
  });
  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";
  const errorView = formatChatError(error);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;
      if (error) clearError();
      void sendMessage({ text });
      setInput("");
    },
    [input, isLoading, sendMessage, error, clearError]
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} isLoading={isLoading} errorView={errorView} />
      <ChatInput
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={handleSubmit}
        disabled={isLoading}
      />
    </div>
  );
}

export default GmailChat;
