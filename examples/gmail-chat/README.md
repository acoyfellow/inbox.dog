# Gmail Chat

Chat with your Gmail inbox using AI. One tool, infinite Gmail.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/inbox.dog/tree/main/examples/gmail-chat)

## What it does

1. **Landing** — Connect with Google
2. **OAuth** — inbox.dog handles Google OAuth; you never touch Google directly
3. **Chat** — AI agent with one tool: `run_gmail_script`
4. **The trick** — Instead of N tools (list, get, search, send...), the agent writes JavaScript that runs in a sandboxed Worker Loader isolate with a `gmail` proxy object. One tool, arbitrary Gmail logic.

## Stack

| Layer | Choice |
|-------|--------|
| AI | [Vercel AI SDK](https://sdk.vercel.ai) (`ai`) |
| Agents | [Cloudflare Agents SDK](https://developers.cloudflare.com/agents) (`agents`) |
| Gmail | [inbox.dog](https://inbox.dog) — OAuth + typed Gmail client |
| Sandbox | [Worker Loaders](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) — isolated V8 for script execution |
| Frontend | React + Vite + Tailwind |
| Hosting | Cloudflare Worker (single app: SSR + Durable Object + static assets) |

## Setup

```bash
cp .env.example .env
npm install
```

### Get inbox.dog credentials

The app needs its own inbox.dog client ID and secret (one per app, for OAuth redirect URIs). From the repo root:

```bash
# From inbox.dog repo root (not examples/gmail-chat)
bun scripts/create-key.ts "Gmail Chat Example"
```

This returns `client_id` and `client_secret`. Add them to `.env` as `INBOX_DOG_CLIENT_ID` and `INBOX_DOG_CLIENT_SECRET`.

Add your redirect URIs to the app in the inbox.dog dashboard:
- Local: `http://localhost:5173/callback`
- Deploy: `https://your-app.workers.dev/callback`

### Workers AI model

This app uses Cloudflare Workers AI via the native `AI` binding in `wrangler.json`, configured to use `@cf/zai-org/glm-4.7-flash`. No Anthropic key is required.

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

Then set your secrets in the Cloudflare dashboard (Workers & Pages → gmail-chat → Settings → Variables and Secrets):
- `INBOX_DOG_CLIENT_ID`
- `INBOX_DOG_CLIENT_SECRET`

Add your deploy URL + `/callback` as a redirect URI in your inbox.dog app settings.

## Architecture

```
Browser ←WebSocket→ InboxAgent (Durable Object)
                         ↓
                    AI SDK streamText
                         ↓
                    run_gmail_script tool
                         ↓
                    Worker Loader isolate
                    (globalOutbound: null)
                         ↓
                    GmailBridge (WorkerEntrypoint)
                         ↓
                    inbox.dog Gmail client
                         ↓
                    Gmail API
```

The agent writes JavaScript code. That code runs in an isolated Worker Loader with no network access. The only way to reach Gmail is through the `gmail` proxy, which routes calls back to the parent worker via `GmailBridge` — a `WorkerEntrypoint` that validates method names against `Gmail.api` and delegates to the inbox.dog client.

`Gmail.describe()` generates the API reference for the system prompt at runtime, so it stays in sync with the package automatically.
