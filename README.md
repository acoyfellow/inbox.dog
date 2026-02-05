# inbox.dog OAuth-as-a-Service

OAuth for email, simplified. Get Gmail/email access tokens without implementing OAuth yourself.

## What is this?

A hosted OAuth service that handles the complexity of Google OAuth for email access. Your users authenticate once, and you get tokens to read/send emails via Gmail API.

## Quick Start

```typescript
// Redirect user to authenticate
window.location.href = 'https://test.inbox.dog/oauth/authorize?client_id=YOUR_KEY&redirect_uri=YOUR_CALLBACK';

// Exchange code for token (in your backend)
const response = await fetch('https://test.inbox.dog/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: 'AUTH_CODE_FROM_CALLBACK',
    client_id: 'YOUR_KEY',
    client_secret: 'YOUR_SECRET'
  })
});
const { access_token, refresh_token } = await response.json();

// Use token with Gmail API
const emails = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
  headers: { Authorization: `Bearer ${access_token}` }
});
```

## Features

- 🔐 **OAuth Flow** - Complete Google OAuth implementation
- 📧 **Gmail Access** - Read and send emails via Gmail API
- 🔄 **Token Refresh** - Automatic token management
- 💳 **Usage-Based Billing** - Pay per OAuth flow via Stripe
- 📚 **Simple API** - Standard OAuth 2.0 endpoints

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your App   │───▶│  inbox.dog   │───▶│  Google     │
│             │◀───│  OAuth       │◀───│  OAuth      │
└─────────────┘    └──────────────┘    └─────────────┘
                          │
                   ┌──────┴──────┐
                   │   Stripe    │
                   │   Billing   │
                   └─────────────┘
```

## Project Structure

```
├── landing/      # Astro landing page + docs
├── worker/       # Cloudflare Worker (Effect-TS)
├── e2e/          # End-to-end tests
└── README.md
```

## Development

```bash
# Landing page
cd landing && npm install && npm run dev

# Worker
cd worker && npm install && npm run dev

# E2E tests
cd e2e && npm test
```

## License

MIT
