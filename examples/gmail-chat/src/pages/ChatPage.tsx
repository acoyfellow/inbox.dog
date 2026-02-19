import GmailChat from "../components/GmailChat";

export default function ChatPage({ userId }: { userId: string }) {
  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 flex-shrink-0">
        <h1 className="text-base font-medium">Gmail Chat</h1>
        <a
          href="/logout"
          className="text-sm text-neutral-400 transition-colors hover:text-neutral-300"
        >
          Log out
        </a>
      </header>
      <div className="flex-1 min-h-0">
        <GmailChat userId={userId} />
      </div>
    </div>
  );
}
