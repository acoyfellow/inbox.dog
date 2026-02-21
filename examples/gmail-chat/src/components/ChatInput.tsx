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

  return (
    <form className="chat-input-bar flex shrink-0 gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800" onSubmit={onSubmit}>
      <input
        type="text"
        value={input}
        onChange={onChange}
        placeholder="Ask about your inbox..."
        disabled={disabled}
        aria-label="Chat message"
        className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-[16px] outline-none placeholder:text-neutral-500 focus:border-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:focus:border-neutral-400"
      />
      <div className="relative">
        <Button
          type="submit"
          variant="primary"
          disabled={disabled || !input.trim()}
          className="bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-400 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Send
        </Button>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-white/25"
        >
          <span
            className="block h-full rounded-full bg-white/90 transition-all"
            style={{ width: `${Math.max(2, boundedPercent)}%` }}
          />
        </span>
      </div>
    </form>
  );
}
