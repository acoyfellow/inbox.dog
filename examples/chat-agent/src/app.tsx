import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/auth/status")
      .then((r) => r.json())
      .then((d: { authenticated: boolean }) => setAuthed(d.authenticated));
  }, []);

  if (authed === null) return <p style={{ padding: 24 }}>Loading...</p>;
  if (!authed) return <Login />;
  return <Chat />;
}

function Login() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <a
        href="/auth/login"
        style={{
          padding: "12px 24px",
          background: "#4285f4",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
          fontSize: 16,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Login with Google
      </a>
    </div>
  );
}

function Chat() {
  const agent = useAgent({ agent: "ChatAgent" });
  const { messages, input, handleInputChange, handleSubmit, clearHistory } = useAgentChat({ agent });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>inbox.dog</h2>
        <div>
          <button onClick={clearHistory} style={{ marginRight: 8 }}>Clear</button>
          <a href="/auth/logout">Logout</a>
        </div>
      </div>

      <div style={{ minHeight: 300, marginBottom: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 12 }}>
            <strong>{msg.role === "user" ? "You" : "Agent"}:</strong>{" "}
            {msg.parts
              .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
              .map((p, i) => (
                <span key={i}>{p.text}</span>
              ))}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="What's unread?"
          style={{ flex: 1, padding: 8, fontSize: 16 }}
        />
        <button type="submit" style={{ padding: "8px 16px" }}>Send</button>
      </form>
    </div>
  );
}
