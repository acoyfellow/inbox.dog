# inbox.dog + Astro + Cloudflare — Chat Example

Gmail OAuth plus AI chat about your inbox. Land on a page, connect with Google, chat, log out. No token env vars for users.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/inbox.dog/tree/main/examples/astro-cloudflare)

## Setup

### 1. Get API key + KV

```bash
# Create inbox.dog key
curl -X POST https://inbox.dog/api/keys -H "Content-Type: application/json" -d '{"name":"my-chat-app"}'

# Create KV namespace for sessions
npx wrangler kv namespace create SESSIONS
```

Add the KV namespace ID to `wrangler.json` under `kv_namespaces`.

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:
- `INBOX_DOG_CLIENT_ID`, `INBOX_DOG_CLIENT_SECRET` — from step 1
- `ANTHROPIC_API_KEY` — for chat AI

### 3. Run locally

```bash
bun install
bun run dev
```

Open http://localhost:4321 → "Connect with Google" → OAuth → chat.

### 4. Deploy

```bash
bun run build
npx wrangler pages deploy dist
```

Set env vars in Cloudflare:
- `INBOX_DOG_CLIENT_ID`
- `INBOX_DOG_CLIENT_SECRET`
- `ANTHROPIC_API_KEY`

## User flow

1. Landing — "Connect with Google" button
2. OAuth — redirect to Google, back to `/callback`
3. Chat — session stored in KV, user chats about their inbox
4. Log out — clears session, back to landing
