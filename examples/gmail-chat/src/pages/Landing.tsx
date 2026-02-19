import { useState, useEffect } from "react";

const ERROR_MAP: Record<string, string> = {
  "OAuthState not found": "Your sign-in link expired. Please try again.",
  "INVALID_CREDENTIALS": "Invalid credentials. Check your inbox.dog client ID and secret.",
  "missing credentials": "Server credentials not configured.",
  "exchange failed": "Sign-in failed. Please try again.",
};

function friendlyError(raw: string): string {
  const decoded = decodeURIComponent(raw);
  for (const [key, msg] of Object.entries(ERROR_MAP)) {
    if (decoded.includes(key)) return msg;
  }
  return decoded;
}

const STACK = [
  { label: "ai sdk", desc: "LLM orchestration" },
  { label: "agents", desc: "Durable Objects" },
  { label: "inbox.dog", desc: "Gmail OAuth" },
  { label: "worker loaders", desc: "Sandboxed V8" },
];

const CODE_LINES = [
  { indent: 0, text: "const result = await gmail.list({" },
  { indent: 1, text: 'query: "is:unread",' },
  { indent: 1, text: "max: 10," },
  { indent: 0, text: "});" },
  { indent: 0, text: "" },
  { indent: 0, text: "return result.messages.map(m => ({" },
  { indent: 1, text: "from: m.from," },
  { indent: 1, text: "subject: m.subject," },
  { indent: 0, text: "}));" },
];

export default function Landing({
  authUrl,
  authUrlError,
  error,
}: {
  authUrl: string | null;
  authUrlError: string | null;
  error: string | null;
}) {
  const rawError = error ?? authUrlError;
  const displayError = rawError ? friendlyError(rawError) : null;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div className="landing-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700&display=swap');

        .landing-root {
          min-height: 100vh;
          background: #0a0a0b;
          color: #e4e4e7;
          font-family: 'Outfit', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .landing-root::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background:
            radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(168, 85, 247, 0.04) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(236, 72, 153, 0.03) 0%, transparent 50%);
          animation: drift 20s ease-in-out infinite alternate;
        }

        @keyframes drift {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-2%, 1%) rotate(1deg); }
        }

        .landing-grain {
          position: fixed;
          inset: 0;
          opacity: 0.03;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 256px 256px;
        }

        .landing-content {
          position: relative;
          z-index: 1;
          max-width: 540px;
          width: 100%;
          padding: 2rem;
        }

        .landing-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.05em;
          color: #71717a;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 2rem;
          opacity: 0;
          transform: translateY(8px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .landing-badge.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .landing-title {
          font-size: 3.2rem;
          font-weight: 700;
          letter-spacing: -0.04em;
          line-height: 1;
          margin: 0 0 1rem;
          background: linear-gradient(135deg, #fafafa 0%, #a1a1aa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
        }

        .landing-title.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-desc {
          font-size: 1.1rem;
          font-weight: 300;
          color: #71717a;
          line-height: 1.6;
          margin: 0 0 2.5rem;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        }

        .landing-desc.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-code {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 2rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          line-height: 1.7;
          overflow-x: auto;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s;
        }

        .landing-code.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-code-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .landing-code-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
        }

        .landing-code-label {
          font-size: 11px;
          color: #52525b;
          letter-spacing: 0.05em;
          margin-left: auto;
        }

        .landing-code-line {
          color: #52525b;
        }

        .landing-code-line .kw { color: #c084fc; }
        .landing-code-line .fn { color: #60a5fa; }
        .landing-code-line .str { color: #4ade80; }
        .landing-code-line .prop { color: #e4e4e7; }
        .landing-code-line .num { color: #fb923c; }

        .landing-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          border-radius: 10px;
          background: #fafafa;
          color: #0a0a0b;
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          text-decoration: none;
          transition: all 0.2s ease;
          border: none;
          cursor: pointer;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.4s;
        }

        .landing-cta.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-cta:hover {
          background: #e4e4e7;
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 24px rgba(255,255,255,0.1);
        }

        .landing-cta:active {
          transform: translateY(0) !important;
        }

        .landing-cta svg {
          width: 18px;
          height: 18px;
        }

        .landing-stack {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 2.5rem;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.5s;
        }

        .landing-stack.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          font-size: 12px;
          color: #52525b;
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s ease;
        }

        .landing-chip:hover {
          border-color: rgba(255,255,255,0.12);
          color: #71717a;
        }

        .landing-chip-name {
          color: #a1a1aa;
          font-weight: 500;
        }

        .landing-error {
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.05);
          color: #fca5a5;
          font-size: 14px;
          margin-bottom: 1.5rem;
          opacity: 0;
          transform: translateY(8px);
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s;
        }

        .landing-error.show {
          opacity: 1;
          transform: translateY(0);
        }

        .landing-loading {
          font-size: 14px;
          color: #52525b;
          opacity: 0;
          transition: opacity 0.5s ease 0.4s;
        }

        .landing-loading.show {
          opacity: 1;
        }

        .landing-hint {
          font-size: 12px;
          color: #3f3f46;
          margin-top: 0.5rem;
        }

        @media (max-width: 480px) {
          .landing-title { font-size: 2.4rem; }
          .landing-content { padding: 1.5rem; }
        }
      `}</style>

      <div className="landing-grain" />

      <div className="landing-content">
        <div className={`landing-badge ${mounted ? "show" : ""}`}>
          <span className="landing-badge-dot" />
          open source demo
        </div>

        <h1 className={`landing-title ${mounted ? "show" : ""}`}>
          Chat with
          <br />
          your inbox.
        </h1>

        <p className={`landing-desc ${mounted ? "show" : ""}`}>
          One tool. The agent writes code, a sandboxed V8 isolate runs it,
          and your Gmail responds.
        </p>

        <div className={`landing-code ${mounted ? "show" : ""}`}>
          <div className="landing-code-header">
            <span className="landing-code-dot" />
            <span className="landing-code-dot" />
            <span className="landing-code-dot" />
            <span className="landing-code-label">run_gmail_script</span>
          </div>
          {CODE_LINES.map((line, i) => (
            <div key={i} className="landing-code-line" style={{ paddingLeft: line.indent * 20 }}>
              {line.text ? colorize(line.text) : "\u00A0"}
            </div>
          ))}
        </div>

        {displayError && (
          <div className={`landing-error ${mounted ? "show" : ""}`} role="alert">
            {displayError}
            {displayError.includes("credentials") && (
              <p className="landing-hint">
                Set INBOX_DOG_CLIENT_ID and INBOX_DOG_CLIENT_SECRET in your Worker env.
              </p>
            )}
          </div>
        )}

        {authUrl ? (
          <a href={authUrl} className={`landing-cta ${mounted ? "show" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect with Google
          </a>
        ) : (
          !rawError && (
            <span className={`landing-loading ${mounted ? "show" : ""}`}>
              Connecting...
            </span>
          )
        )}

        <div className={`landing-stack ${mounted ? "show" : ""}`}>
          {STACK.map((s) => (
            <div key={s.label} className="landing-chip">
              <span className="landing-chip-name">{s.label}</span>
              {s.desc}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function colorize(text: string) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const rules: [RegExp, string][] = [
    [/\b(const|return|await)\b/g, "kw"],
    [/\b(gmail\.list|gmail\.search|gmail\.get)\b/g, "fn"],
    [/("[^"]*")/g, "str"],
    [/\b(\d+)\b/g, "num"],
    [/\b(query|max|messages|map|from|subject)\b(?=[:,\)])/g, "prop"],
  ];

  // Simple single-pass: just return colored spans
  const tokens = remaining.split(/(\b(?:const|return|await)\b|\b(?:gmail\.list|gmail\.search|gmail\.get)\b|"[^"]*"|\b\d+\b|\b(?:query|max|messages|map|from|subject)\b(?=[:,)]))/g);

  for (const token of tokens) {
    if (!token) continue;
    let cls = "";
    for (const [re, c] of rules) {
      re.lastIndex = 0;
      if (re.test(token)) { cls = c; break; }
    }
    parts.push(cls ? <span key={key++} className={cls}>{token}</span> : <span key={key++}>{token}</span>);
  }

  return parts;
}
