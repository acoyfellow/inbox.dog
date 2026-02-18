import { useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import { useAutoScroll } from "../lib/hooks";
import { ChatInput } from "./ChatInput";
import { ToolInvocation } from "./ToolInvocation";

interface GmailChatProps {
  userId: string;
}

type Message = {
  id: string;
  role: string;
  content?: string | unknown[];
  parts?: Array<{ type: string; text?: string; toolInvocation?: { toolName: string; args: Record<string, unknown>; state: string; result?: unknown } }>;
};

function MessageList({
  messages,
  isLoading,
}: {
  messages: Message[];
  isLoading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoScroll(scrollRef, [messages, isLoading]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4" ref={scrollRef}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
            msg.role === "user"
              ? "ml-auto bg-neutral-700 text-neutral-100"
              : "bg-neutral-900 text-neutral-200"
          }`}
        >
          {typeof msg.content === "string" && msg.content}
          {Array.isArray(msg.parts) &&
            msg.parts.map((part, i) => {
              if (part.type === "text" && part.text) return <div key={i}>{part.text}</div>;
              if (part.type === "tool-invocation" && part.toolInvocation)
                return (
                  <ToolInvocation
                    key={i}
                    invocation={{
                      toolName: part.toolInvocation.toolName,
                      args: part.toolInvocation.args as { code?: string; intent?: string },
                      state: part.toolInvocation.state,
                      result: part.toolInvocation.result,
                    }}
                  />
                );
              return null;
            })}
          {Array.isArray(msg.content) &&
            msg.content.map((part: unknown, i: number) => {
              const p = part as { type?: string; text?: string; toolInvocation?: { toolName: string; args: Record<string, unknown>; state: string; result?: unknown } };
              if (p?.type === "text" && p.text) return <div key={i}>{p.text}</div>;
              if (p?.type === "tool-invocation" && p.toolInvocation)
                return (
                  <ToolInvocation
                    key={i}
                    invocation={{
                      toolName: p.toolInvocation.toolName,
                      args: p.toolInvocation.args as { code?: string; intent?: string },
                      state: p.toolInvocation.state,
                      result: p.toolInvocation.result,
                    }}
                  />
                );
              return null;
            })}
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

export function GmailChat({ userId }: GmailChatProps) {
  const agent = useAgent({
    agent: "InboxAgent",
    name: userId,
    host: typeof window !== "undefined" ? window.location.origin : "",
  });
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useAgentChat({
    agent,
  });

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <div className="flex flex-1 flex-col min-h-0">
        <MessageList messages={messages as Message[]} isLoading={isLoading} />
        <ChatInput
          input={input}
          onChange={(e) => handleInputChange(e as unknown as React.ChangeEvent<HTMLInputElement>)}
          onSubmit={handleSubmit}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

export default GmailChat;
