import type { EmailSummary } from "../domain/script";
import { formatRelative } from "../lib/format";

export function EmailCard({ email }: { email: EmailSummary }) {
  return (
    <div className="min-w-0 flex flex-col gap-0.5 rounded border border-neutral-800 bg-neutral-950 px-3 py-2">
      <div className="flex justify-between text-sm">
        <span className="truncate max-w-[60%] text-neutral-300">{email.from}</span>
        <span className="shrink-0 text-neutral-600">{formatRelative(email.date)}</span>
      </div>
      <div className="truncate text-base text-neutral-200">{email.subject}</div>
      <div className="truncate text-sm text-neutral-500">{email.snippet}</div>
    </div>
  );
}
