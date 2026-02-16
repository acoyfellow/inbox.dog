# inbox.dog

**Full Gmail access for your agents.** Read, write, search, and send — not just read-only.

[![Live](https://img.shields.io/badge/live-inbox.dog-blue)](https://inbox.dog)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## The problem

Most Gmail automations are read-only. Not by choice — Google requires a **CASA Tier 2 security audit** before any app can use Gmail write scopes in production. That audit costs $550+, takes months, and requires annual recertification.

inbox.dog already passed the audit. Your agents get full read + write + search access today.

## Two ways to connect

### MCP Server (zero-code)

Drop into Claude Desktop, Cursor, Windsurf, or any MCP-compatible agent:

```json
{
  "mcpServers": {
    "inbox-dog": {
      "command": "npx",
      "args": ["-y", "inbox.dog", "mcp"],
      "env": {
        "INBOXDOG_KEY": "YOUR_KEY",
        "INBOXDOG_SECRET": "YOUR_SECRET"
      }
    }
  }
}
```

Tools: `read_emails`, `read_email`, `send_email`, `search_emails`, `get_profile`

### npm Package (full control)

```bash
npm install inbox.dog
```

```typescript
import InboxDog from 'inbox.dog';
const dog = new InboxDog();

// 1. Send user to authenticate
const authUrl = dog.getAuthUrl({
  clientId: 'YOUR_KEY',
  redirectUri: 'http://localhost:3000/callback',
});

// 2. Exchange code for tokens
const { access_token, refresh_token, email } =
  await dog.exchangeCode(code, 'YOUR_KEY', 'YOUR_SECRET');

// 3. Your agent can now read AND write Gmail
const emails = await fetch(
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ raw: encodedEmail }),
  }
);
```

## Features

- **Full Read + Write + Search** — Not just read-only. Send emails, create drafts, manage labels, search inboxes.
- **MCP Native** — Ships as an MCP server. Claude, Cursor, Windsurf, and any MCP client can use it directly.
- **CASA Tier 2 Verified** — We passed Google's security audit so you don't have to.
- **Auto-Refresh Tokens** — Tokens expire; inbox.dog handles refresh automatically. Refresh is free.
- **$0.10 Per Auth** — Pay per OAuth flow, not per API call. 10 free credits to start.
- **Open Source** — MIT licensed. Self-host on your own Cloudflare account whenever you want.

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your Agent │───▶│  inbox.dog   │───▶│  Google     │
│  or App     │◀───│  (Effect-TS) │◀───│  OAuth      │
└─────────────┘    └──────────────┘    └─────────────┘
```

Built with:
- **[Effect](https://effect.website)** — Type-safe error handling, services, schemas
- **[Hono](https://hono.dev)** — Fast web framework for Cloudflare Workers
- **[Astro](https://astro.build)** — Static landing page
- **Cloudflare Workers** — Edge deployment

## Project Structure

```
├── landing/          # Astro landing page + docs
│   ├── src/pages/    # index, docs, pricing, demo, blog
│   └── public/       # fonts, logo, llms.txt
├── worker/           # Cloudflare Worker (Effect-TS)
│   ├── src/
│   │   ├── routes/   # oauth, api, mcp, webhooks
│   │   ├── services/ # google, kv (Effect services)
│   │   ├── schemas.ts
│   │   ├── errors.ts
│   │   └── runtime.ts
│   └── wrangler.toml
├── package/          # npm package (inbox.dog)
│   └── src/index.ts  # TypeScript client library
├── e2e/              # End-to-end tests
└── .husky/           # Git hooks
```

## Scopes

| Scope | Permission |
|-------|------------|
| `gmail:read` | Read-only |
| `gmail:send` | Send only |
| `gmail:full` | Full access (read, send, modify, label, draft) |

Legacy scope names (`email`, `email:read`, `email:send`, `email:full`) are also supported.

## Self-Hosting

### Prerequisites

1. [Cloudflare account](https://cloudflare.com)
2. [Google Cloud project](https://console.cloud.google.com) with Gmail API enabled
3. Node.js 18+

### Setup

```bash
git clone https://github.com/acoyfellow/inbox.dog
cd inbox.dog

# Install dependencies
cd worker && npm install
cd ../landing && npm install

# Create KV namespaces (one per environment)
wrangler kv:namespace create KV
wrangler kv:namespace create KV --env staging
# Update wrangler.toml with the IDs

# Set secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ENCRYPTION_SECRET

# Optional: Stripe for billing
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET

# Deploy
cd worker && wrangler deploy
cd ../landing && npm run build && wrangler pages deploy dist
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable Gmail API
3. Create OAuth credentials (Web application)
4. Add redirect URI: `https://your-domain.com/oauth/callback`

## API Reference

### Create API Key

```bash
POST /api/keys
{"name": "my-app", "redirect_uris": ["https://myapp.com/callback"]}

# Response
{"client_id": "id_...", "client_secret": "sk_...", "credits": 10}
```

### OAuth Flow

```bash
# 1. Authorize
GET /oauth/authorize?client_id=...&redirect_uri=...&scope=gmail:full

# 2. Callback (automatic redirect)
GET /oauth/callback?code=...&state=...

# 3. Exchange token
POST /oauth/token
{"code": "...", "client_id": "...", "client_secret": "..."}

# Response
{"access_token": "...", "refresh_token": "...", "email": "user@example.com"}
```

## Pricing

| Item | Cost |
|------|------|
| OAuth flow | $0.10 |
| Token refresh | Free |
| Gmail API calls | Free (unlimited) |
| Signup credits | 10 free |
| Self-host | Free (MIT) |

Cheaper than the CASA audit until ~5,500 OAuth flows.

## Development

```bash
# Worker (with local KV)
cd worker && wrangler dev

# Landing page
cd landing && npm run dev

# Run tests
cd e2e && npm test
```

## Contributing

PRs welcome! Please run `npm run build` and `npx tsc --noEmit` before submitting.

## License

MIT - see [LICENSE](LICENSE)
