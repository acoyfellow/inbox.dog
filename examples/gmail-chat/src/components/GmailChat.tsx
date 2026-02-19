import { useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAutoScroll } from "../lib/hooks";
import { ChatInput } from "./ChatInput";

interface GmailChatProps {
  userId: string;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function MessageList({
  messages,
  isLoading,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoScroll(scrollRef, [messages, isLoading]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" ref={scrollRef}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${
            msg.role === "user"
              ? "ml-auto bg-neutral-700 text-neutral-100"
              : "bg-neutral-900 text-neutral-200"
          }`}
        >
          {msg.content}
        </div>
      ))}
      {isLoading && (
        <div className="max-w-[85%] rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-neutral-500">
          ...
        </div>
      )}
    </div>
  );
}

let msgCounter = 0;

export function GmailChat({ userId }: GmailChatProps) {
  const host = typeof window !== "undefined" ? window.location.origin : "";
  const agent = useAgent({
    agent: "inbox-agent",
    name: userId,
    host,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const assistantTextRef = useRef("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;

      const userMsg: ChatMessage = { id: `user-${++msgCounter}`, role: "user", content: text };
      const assistantId = `assistant-${++msgCounter}`;
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);
      assistantTextRef.current = "";

      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const onMessage = (event: MessageEvent) => {
        let data: { type: string; id: string; body?: string; done?: boolean; error?: boolean };
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type !== "cf_agent_use_chat_response" || data.id !== requestId) return;

        if (data.error) {
          assistantTextRef.current = `Error: ${data.body}`;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantId);
            if (existing) return prev.map((m) => (m.id === assistantId ? { ...m, content: assistantTextRef.current } : m));
            return [...prev, { id: assistantId, role: "assistant", content: assistantTextRef.current }];
          });
        }

        if (data.body) {
          // Parse AI SDK data stream format: 0:"text chunk"\n
          const textMatches = data.body.matchAll(/0:"((?:[^"\\]|\\.)*)"/g);
          for (const match of textMatches) {
            const decoded = match[1]
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, "\\");
            assistantTextRef.current += decoded;
          }
          if (assistantTextRef.current) {
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === assistantId);
              if (existing) return prev.map((m) => (m.id === assistantId ? { ...m, content: assistantTextRef.current } : m));
              return [...prev, { id: assistantId, role: "assistant", content: assistantTextRef.current }];
            });
          }
        }

        if (data.done) {
          setIsLoading(false);
          agent.removeEventListener("message", onMessage);
        }
      };

      agent.addEventListener("message", onMessage);

      // Build the messages array for the agent (all messages including the new one)
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      agent.send(
        JSON.stringify({
          id: requestId,
          type: "cf_agent_use_chat_request",
          init: {
            method: "POST",
            body: JSON.stringify({ messages: allMessages }),
            headers: { "Content-Type": "application/json" },
          },
          url: `${host}/agents/inbox-agent/${encodeURIComponent(userId)}`,
        })
      );
    },
    [input, isLoading, messages, agent, host, userId]
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} isLoading={isLoading} />
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
