import { useState, useEffect } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { ThemeToggle } from "../components/ThemeToggle";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20} aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

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

const GITHUB_EXAMPLE_URL = "https://github.com/acoyfellow/inbox.dog/tree/main/examples/gmail-chat";

const STACK = [
  { label: "ai sdk", desc: "LLM orchestration", href: "https://sdk.vercel.ai" },
  { label: "agents", desc: "Durable Objects", href: "https://developers.cloudflare.com/agents/" },
  { label: "inbox.dog", desc: "Gmail OAuth", href: "https://inbox.dog" },
  { label: "worker loaders", desc: "Sandboxed V8", href: "https://developers.cloudflare.com/workers/platform/worker-loaders/" },
];

const USER_QUESTION = "Hi, can you read my inbox?";
const CODE_LINES = [
  { indent: 0, text: "const res = await gmail_get({" },
  { indent: 1, text: "  path: '/messages?q=in:inbox'," },
  { indent: 0, text: "});" },
  { indent: 0, text: "" },
  { indent: 0, text: "return res.resultSizeEstimate;" },
];
const SAMPLE_RESPONSE = "You have 12 emails in your inbox.";

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
      <div className="landing-top-right">
        <a href={GITHUB_EXAMPLE_URL} className="landing-github" aria-label="View example on GitHub">
          <GitHubIcon />
        </a>
        <ThemeToggle />
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700&display=swap');

        .landing-root {
          min-height: 100vh;
          background: var(--page-bg);
          color: var(--page-text);
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
            radial-gradient(ellipse at 20% 50%, rgba(var(--glow-r), var(--glow-g), var(--glow-b), var(--glow-opacity)) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(var(--glow-2-r), var(--glow-2-g), var(--glow-2-b), var(--glow-2-opacity)) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(var(--glow-3-r), var(--glow-3-g), var(--glow-3-b), var(--glow-3-opacity)) 0%, transparent 50%);
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

        .landing-top-right {
          position: fixed;
          top: 1rem;
          right: 1rem;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .landing-github {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--page-text);
          opacity: 0.75;
          transition: opacity 0.2s;
        }
        .landing-github:hover {
          opacity: 1;
        }

        .landing-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 2rem;
          opacity: 0;
          transform: translateY(8px);
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .landing-header.show {
          opacity: 1;
          transform: translateY(0);
        }
        .landing-logo {
          display: inline-block;
          opacity: 0.7;
          transition: opacity 0.2s;
        }
        .landing-logo:hover {
          opacity: 1;
        }
        .landing-logo-img {
          height: 28px;
          width: auto;
          display: block;
          vertical-align: middle;
        }
        [data-theme="dark"] .landing-logo-img,
        [data-mode="dark"] .landing-logo-img {
          filter: invert(1);
        }

        .landing-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 100px;
          border: 1px solid var(--page-border);
          background: var(--card-bg);
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.05em;
          color: var(--page-muted);
          font-family: 'JetBrains Mono', monospace;
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
          background: linear-gradient(135deg, var(--gradient-from) 0%, var(--gradient-to) 100%);
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
          color: var(--page-muted);
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

        .landing-steps {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 2rem;
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s;
        }
        .landing-steps.show {
          opacity: 1;
          transform: translateY(0);
        }
        .landing-step-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: var(--page-muted-2);
          margin-bottom: 0.35rem;
        }
        .landing-step-bubble {
          padding: 0.75rem 1rem;
          border-radius: 10px;
          font-size: 14px;
          line-height: 1.5;
        }
        .landing-step-you {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--page-text);
          margin-left: 0;
          margin-right: auto;
          max-width: 85%;
        }
        .landing-step-response {
          background: rgba(74, 222, 128, 0.12);
          border: 1px solid rgba(74, 222, 128, 0.35);
          color: var(--page-text);
          margin-left: 0;
          margin-right: auto;
          max-width: 85%;
        }
        .landing-code {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 10px;
          padding: 1rem 1.25rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          line-height: 1.7;
          overflow-x: auto;
        }
        .landing-code-line {
          color: #334155;
        }
        .landing-code-line .kw { color: #7c3aed; }
        .landing-code-line .fn { color: #0284c7; }
        .landing-code-line .str { color: #059669; }
        .landing-code-line .prop { color: #1e40af; }
        .landing-code-line .num { color: #c2410c; }

        .landing-cta-wrapper {
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.4s;
        }
        .landing-cta-wrapper.show {
          opacity: 1;
          transform: translateY(0);
        }
        .landing-cta-wrapper [data-slot] svg,
        .landing-cta-wrapper button svg {
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
          border: 1px solid var(--card-border);
          background: var(--card-bg);
          font-size: 12px;
          color: var(--page-muted-2);
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .landing-chip:hover {
          border-color: var(--page-border-2);
          color: var(--page-muted);
        }

        .landing-chip-name {
          color: var(--gradient-to);
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
          color: var(--page-muted-2);
          opacity: 0;
          transition: opacity 0.5s ease 0.4s;
        }

        .landing-loading.show {
          opacity: 1;
        }

        .landing-hint {
          font-size: 12px;
          color: var(--page-muted-2);
          margin-top: 0.5rem;
          opacity: 0.9;
        }

        @media (max-width: 480px) {
          .landing-title { font-size: 2.4rem; }
          .landing-content { padding: 1.5rem; }
        }
      `}</style>

      <div className="landing-grain" />

      <div className="landing-content">
        <div className={`landing-header ${mounted ? "show" : ""}`}>
          <a href="https://inbox.dog" className="landing-logo" aria-label="inbox.dog">
            <img src="https://inbox.dog/logo.svg" alt="" className="landing-logo-img" />
          </a>
          <div className="landing-badge">
            <span className="landing-badge-dot" />
            open source demo
          </div>
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

        <div className={`landing-steps ${mounted ? "show" : ""}`}>
          <div className="landing-step">
            <span className="landing-step-label">You</span>
            <div className="landing-step-bubble landing-step-you">{USER_QUESTION}</div>
          </div>
          <div className="landing-step">
            <span className="landing-step-label">Code the agent generates (runs in sandbox)</span>
            <div className="landing-code">
              {CODE_LINES.map((line, i) => (
                <div key={i} className="landing-code-line" style={{ paddingLeft: line.indent * 20 }}>
                  {line.text ? colorize(line.text) : "\u00A0"}
                </div>
              ))}
            </div>
          </div>
          <div className="landing-step">
            <span className="landing-step-label">Response</span>
            <div className="landing-step-bubble landing-step-response">{SAMPLE_RESPONSE}</div>
          </div>
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
          <div className={`landing-cta-wrapper ${mounted ? "show" : ""}`}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => { window.location.href = authUrl; }}
            >
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18, marginRight: 10 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect with Google
            </Button>
          </div>
        ) : (
          !rawError && (
            <span className={`landing-loading ${mounted ? "show" : ""}`}>
              Connecting...
            </span>
          )
        )}

        <div className={`landing-stack ${mounted ? "show" : ""}`}>
          {STACK.map((s) => (
            <a key={s.label} href={s.href} className="landing-chip">
              <span className="landing-chip-name">{s.label}</span>
              {s.desc}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function colorize(text: string) {
  const parts: React.ReactNode[] = [];
  const remaining = text;
  let key = 0;

  const rules: [RegExp, string][] = [
    [/\b(const|return|await)\b/g, "kw"],
    [/\b(gmail_get|gmail_post)\b/g, "fn"],
    [/(["'][^"']*["'])/g, "str"],
    [/\b(\d+)\b/g, "num"],
    [/\b(path|resultSizeEstimate)\b/g, "prop"],
  ];

  const tokens = remaining.split(/(\b(?:const|return|await)\b|\b(?:gmail_get|gmail_post)\b|["'][^"']*["']|\b\d+\b|\b(?:path|resultSizeEstimate)\b)/g);

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
