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
  const canSend = !disabled && input.trim().length > 0;

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
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-md px-5 py-2 text-[16px] font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 disabled:bg-neutral-600 disabled:text-neutral-400 disabled:cursor-not-allowed"
        >
          Send
        </button>
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
