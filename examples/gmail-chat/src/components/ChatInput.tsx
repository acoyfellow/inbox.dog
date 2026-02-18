interface ChatInputProps {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  disabled?: boolean;
}

export function ChatInput({ input, onChange, onSubmit, disabled }: ChatInputProps) {
  return (
    <form className="flex gap-2 border-t border-neutral-800 p-4" onSubmit={onSubmit}>
      <input
        type="text"
        value={input}
        onChange={onChange}
        placeholder="Ask about your inbox..."
        disabled={disabled}
        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
        autoFocus
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        className="rounded-lg bg-neutral-100 px-5 py-2.5 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
