# inbox.dog + Astro + Cloudflare Pages

Gmail OAuth in an Astro app, deployed to Cloudflare Pages.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/inbox.dog/tree/main/examples/astro-cloudflare)

## Setup

### 1. Get your API key

```bash
curl -X POST https://inbox.dog/api/keys -H "Content-Type: application/json" -d '{"name":"my-astro-app"}'
```

Save the `client_id` and `client_secret` from the response.

### 2. Clone and install

```bash
git clone https://github.com/acoyfellow/inbox.dog
cd inbox.dog/examples/astro-cloudflare
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` with your `client_id` and `client_secret`.

### 4. Run locally

```bash
npm run dev
```

Open http://localhost:4321 and click "Connect Gmail".

### 5. Deploy to Cloudflare Pages

```bash
npm run build
wrangler pages deploy dist
```

Set environment variables in the Cloudflare dashboard:
- `INBOX_DOG_CLIENT_ID` = your client_id
- `INBOX_DOG_CLIENT_SECRET` = your client_secret

## How it works

1. `src/pages/index.astro` — builds the OAuth URL with `dog.getAuthUrl()` and renders a "Connect Gmail" button
2. User clicks → redirected to Google consent → redirected back to `/callback`
3. `src/pages/callback.astro` — exchanges the code for tokens with `dog.exchangeCode()`
4. Tokens work directly with `gmail.googleapis.com`

## Files

```
├── src/pages/
│   ├── index.astro      # Landing page with OAuth button
│   └── callback.astro   # Token exchange handler
├── astro.config.mjs     # Astro + Cloudflare adapter
├── wrangler.toml        # Cloudflare Pages config
└── .env.example         # Required env vars
```
