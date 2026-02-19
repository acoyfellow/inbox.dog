# AI Email Agent

An AI agent that triages your inbox while you sleep. Uses Claude to classify emails and the [hosted inbox.dog API](https://inbox.dog) for Gmail access.

## What it does

1. Reads your unread emails
2. Asks Claude to classify each one (marketing? receipt? human?)
3. Takes action — archive junk, label receipts, leave important stuff alone

## Setup

### 1. Create key + Connect Gmail (one-time)

Go to [inbox.dog/connect](https://inbox.dog/connect). Create an API key, click Connect Gmail, authorize. Tokens are stored server-side — you never copy/paste them.

### 2. Configure

```bash
cp .env.example .env
```

Fill in `INBOX_DOG_CLIENT_ID`, `INBOX_DOG_CLIENT_SECRET` (from Connect), and `ANTHROPIC_API_KEY`.

### 3. Run

```bash
bun install
bun run start
```

### 4. Schedule it

```bash
*/15 * * * * cd /path/to/ai-email-agent && bun run start >> agent.log 2>&1
```

## Deploy to Cloudflare Workers

```bash
bun install
npx wrangler secret put INBOX_DOG_CLIENT_ID
npx wrangler secret put INBOX_DOG_CLIENT_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
bun run deploy
```

After deploy:
- **Cron**: Runs automatically every 15 minutes.
- **Manual**: `GET https://<your-worker>.workers.dev` to trigger once.

## Customize

Edit the `RULES` prompt in `agent.ts` to match your preferences.
