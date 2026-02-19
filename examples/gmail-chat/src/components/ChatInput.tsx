import { Input } from "@cloudflare/kumo/components/input";
import { Button } from "@cloudflare/kumo/components/button";

interface ChatInputProps {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  disabled?: boolean;
  contextPercent?: number;
}

export function ChatInput({
  input,
  onChange,
  onSubmit,
  disabled,
  contextPercent = 0,
}: ChatInputProps) {
  const boundedPercent = Math.max(0, Math.min(100, contextPercent));
  const marker = `${Math.max(2, boundedPercent).toFixed(2)}%`;

  return (
    <form className="chat-input-bar flex flex-shrink-0 gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800" onSubmit={onSubmit}>
      <Input
        value={input}
        onChange={onChange}
        placeholder="Ask about your inbox..."
        disabled={disabled}
        aria-label="Chat message"
        className="flex-1"
      />
      <Button
        type="submit"
        variant="primary"
        disabled={disabled || !input.trim()}
        style={
          {
            backgroundImage:
              `linear-gradient(to right, rgba(255,255,255,0.92) 0 ${marker}, rgba(255,255,255,0.28) ${marker} 100%)`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 2px",
            backgroundPosition: "left bottom",
          } as React.CSSProperties
        }
      >
        Send
      </Button>
    </form>
  );
}
