# inbox.dog

**OAuth for email, simplified.** Get Gmail access tokens without implementing OAuth yourself.

[![Live Demo](https://img.shields.io/badge/demo-inbox.dog-blue)](https://inbox.dog)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## What is this?

A hosted OAuth service that handles the complexity of Google OAuth for email access. Your users authenticate once, and you get tokens to read/send emails via Gmail API.

**3 API calls:**

```typescript
import InboxDog from 'inbox.dog';
const dog = new InboxDog();

// 1. Send user to authenticate
const url = dog.getAuthUrl({ clientId: 'YOUR_KEY', redirectUri: 'http://localhost:3000/callback' });

// 2. Exchange code for tokens (in your callback)
const { access_token, email } = await dog.exchangeCode(code, 'YOUR_KEY', 'YOUR_SECRET');

// 3. Use with Gmail API
const emails = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages',
  { headers: { Authorization: `Bearer ${access_token}` } });
```

## Features

- **Complete OAuth Flow** - We handle the Google OAuth dance
- **Gmail API Access** - Read emails, send messages, manage labels
- **Token Refresh** - Automatic token management
- **Usage-Based Billing** - $0.10 per OAuth flow, 10 free credits
- **Standard OAuth 2.0** - Works with any HTTP client
- **Open Source** - Self-host with your own Google credentials

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your App   │───▶│  inbox.dog   │───▶│  Google     │
│             │◀───│  (Effect-TS) │◀───│  OAuth      │
└─────────────┘    └──────────────┘    └─────────────┘
```

Built with:
- **[Effect](https://effect.website)** - Type-safe error handling, services, schemas
- **[Hono](https://hono.dev)** - Fast web framework for Cloudflare Workers
- **[Astro](https://astro.build)** - Static landing page
- **Cloudflare Workers** - Edge deployment

## npm Package

```bash
npm install inbox.dog
```

```ts
import { InboxDog } from "inbox.dog";

const dog = new InboxDog();
const key = await dog.createKey("my-app");
const url = dog.getAuthUrl({ clientId: key.client_id, redirectUri: "http://localhost:3000/callback" });
// redirect user → exchange code → get tokens
const tokens = await dog.exchangeCode(code, key.client_id, key.client_secret);
```

See [`package/README.md`](package/README.md) for full API docs.

## MCP Server (Agent Integration)

inbox.dog includes an MCP server so AI agents can handle Gmail OAuth directly:

```json
{
  "mcpServers": {
    "inbox-dog": {
      "command": "npx",
      "args": ["-y", "@inboxdog/mcp-server"]
    }
  }
}
```

Tools: `inbox_dog_create_key`, `inbox_dog_oauth_start`, `inbox_dog_exchange_code`, `inbox_dog_refresh_token`, `inbox_dog_check_credits`

## Project Structure

```
├── landing/          # Astro landing page + docs
│   ├── src/pages/    # index, docs, pricing, demo
│   └── public/       # fonts, logo, llms.txt
├── worker/           # Cloudflare Worker (Effect-TS)
│   ├── src/
│   │   ├── routes/   # oauth, api, webhooks
│   │   ├── services/ # google, kv (Effect services)
│   │   ├── schemas.ts
│   │   └── errors.ts # Tagged errors
│   └── wrangler.toml
├── package/          # npm package (inbox.dog)
│   └── src/index.ts  # TypeScript client library
├── mcp/              # MCP server for agent integration
│   └── src/index.ts  # stdio MCP server
├── e2e/              # End-to-end tests
└── .husky/           # Git hooks
```

## Hosted vs Self-Hosted

inbox.dog is open source — you can self-host it. But there's a reason the hosted version exists.

Gmail uses **restricted OAuth scopes**, which means Google requires a [CASA Tier 2 security audit](https://appdefensealliance.dev/casa) before your app can go to production. That audit includes:

- OWASP ZAP vulnerability scan across all endpoints
- Security headers, caching directives, error disclosure review
- Self-attestation questionnaire (50+ items)
- Verification by an authorized lab (we used [TAC Security](https://tacsecurity.com), ~$550)
- Annual recertification

If you're building a product that needs Gmail access for fewer than ~5,500 users, the hosted version at $0.10/flow is cheaper than paying for the audit yourself. Above that, self-hosting makes more financial sense — and you'll have the full source code to work with.

Either way, you skip the Google Cloud Console setup, OAuth consent screen review, and months of back-and-forth with Google's trust & safety team.

## Self-Hosting

### Prerequisites

1. [Cloudflare account](https://cloudflare.com)
2. [Google Cloud project](https://console.cloud.google.com) with Gmail API enabled
3. Node.js 18+

### Setup

```bash
# Clone
git clone https://github.com/acoyfellow/inbox.dog
cd inbox.dog

# Install dependencies
cd worker && npm install
cd ../landing && npm install

# Create KV namespace
wrangler kv:namespace create KV
# Update wrangler.toml with the ID

# Set secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put JWT_SECRET  # openssl rand -hex 32

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
{"name": "my-app"}

# Response
{"client_id": "id_...", "client_secret": "sk_...", "credits": 10}
```

### OAuth Flow

```bash
# 1. Authorize
GET /oauth/authorize?client_id=...&redirect_uri=...&scope=email

# 2. Callback (automatic redirect)
GET /oauth/callback?code=...&state=...

# 3. Exchange token
POST /oauth/token
{"code": "...", "client_id": "...", "client_secret": "..."}

# Response
{"access_token": "...", "refresh_token": "...", "email": "user@example.com"}
```

### Scopes

| Scope | Permission |
|-------|------------|
| `email` | Read-only (default) |
| `email:read` | Read-only |
| `email:send` | Send only |
| `email:full` | Full access |

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
