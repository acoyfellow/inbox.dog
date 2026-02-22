# Gmail Chat

Chat with your Gmail inbox using AI. One tool, infinite Gmail.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/inbox.dog/tree/main/examples/gmail-chat)

## What it does

1. **Landing** — Connect with Google
2. **OAuth** — inbox.dog handles Google OAuth; you never touch Google directly
3. **Chat** — AI agent with one tool: `codemode` (run a JS async arrow in a sandbox).
4. **The trick** — Instead of N tools (list, get, search, send...), the agent writes JavaScript that runs in a Worker Loader isolate; inside the arrow it calls `gmail_get` / `gmail_post`. One tool, arbitrary Gmail logic.

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
bun install
```

For local dev the worker reads secrets from `.dev.vars` (wrangler). Copy `.env.example` to `.dev.vars` and set values there, or use `.env` if your dev setup injects it.

### Get inbox.dog credentials

The app needs its own inbox.dog client ID and secret (one per app, for OAuth redirect URIs). From the repo root:

```bash
# From inbox.dog repo root (not examples/gmail-chat)
bun scripts/create-key.ts "Gmail Chat Example"
```

This returns `client_id` and `client_secret`. Add them to `.env` / `.dev.vars` as `INBOX_DOG_CLIENT_ID` and `INBOX_DOG_CLIENT_SECRET`.

Add your redirect URIs to the app in the inbox.dog dashboard:
- Local: `http://localhost:5173/callback`
- Deploy: `https://your-app.workers.dev/callback`

### Workers AI model

This app uses Cloudflare Workers AI via the native `AI` binding in `wrangler.json`, configured to use `@cf/zai-org/glm-4.7-flash`. No Anthropic key is required.

```bash
bun run dev
```

## Deploy

```bash
bun run deploy
```

Then set your secrets in the Cloudflare dashboard (Workers & Pages → gmail-chat → Settings → Variables and Secrets):
- `INBOX_DOG_CLIENT_ID`
- `INBOX_DOG_CLIENT_SECRET`

Add your deploy URL + `/callback` as a redirect URI in your inbox.dog app settings.

## E2E tests

Optional: run Playwright E2E (e.g. codemode flow). Copy `.dev.vars.example` to `.dev.vars` and set `TEST_INJECT_SECRET=dev-secret` (used for session injection). Then: `bun run test:e2e:codemode`.

## Architecture

```
Browser ←WebSocket→ InboxAgent (Durable Object)
                         ↓
                    AI SDK streamText
                         ↓
                    codemode tool (one JS async arrow)
                         ↓
                    Worker Loader isolate (runs user code)
                         ↓
                    gmail_get / gmail_post (tools, run in parent)
                         ↓
                    Gmail REST API (Bearer token)
```

The agent writes one JavaScript async arrow per turn. That code runs in an isolated Worker Loader (no network). Inside the arrow the model calls `gmail_get` / `gmail_post`; those tools run in the parent and call the Gmail REST API with the user's token. The API surface in the system prompt is generated from `api-surface.ts`.

Part of [inbox.dog](https://inbox.dog) (MIT).
