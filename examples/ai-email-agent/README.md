# AI Email Agent

An AI agent that triages your inbox while you sleep. Uses Claude to classify emails and the [hosted inbox.dog API](https://inbox.dog) for Gmail access.

## What it does

1. Reads your unread emails
2. Asks Claude to classify each one (marketing? receipt? human?)
3. Takes action — archive junk, label receipts, leave important stuff alone

## Setup

### 1. Get your inbox.dog API key

```bash
curl -X POST https://inbox.dog/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name":"email-agent"}'
```

### 2. Authenticate with Gmail

Complete the OAuth flow to get your `access_token` and `refresh_token`. See the [inbox.dog docs](https://inbox.dog/docs/tutorial) for a walkthrough.

### 3. Configure

```bash
cp .env.example .env
```

Fill in your inbox.dog credentials, Gmail tokens, and Anthropic API key.

### 4. Run

```bash
npm install
npm start
```

### 5. Schedule it

Run it on a cron (every 15 minutes, hourly, whatever suits you):

```bash
*/15 * * * * cd /path/to/ai-email-agent && npm start >> agent.log 2>&1
```

## Deploy to Cloudflare Workers

Runs on a cron (every 15 min) and supports manual trigger via GET.

```bash
# 1. Install
npm install

# 2. Set secrets (required before deploy)
npx wrangler secret put GMAIL_ACCESS_TOKEN
npx wrangler secret put GMAIL_REFRESH_TOKEN
npx wrangler secret put INBOX_DOG_CLIENT_ID
npx wrangler secret put INBOX_DOG_CLIENT_SECRET
npx wrangler secret put ANTHROPIC_API_KEY

# 3. Deploy
npm run deploy
```

After deploy:
- **Cron**: Runs automatically every 15 minutes.
- **Manual**: `GET https://<your-worker>.workers.dev` to trigger once.

## Customize

Edit the `RULES` prompt in `agent.ts` to match your preferences. The agent is just a prompt — change it however you want.
