# Gmail Chat Demo

Showcases **ai** + **agents** + **inbox.dog** and their OOTB easy-to-connect-ability.

Standalone open-source app: land on a page, log in with Google, chat with your inbox. Ephemeral multi-conversation. One tool, infinite Gmail.

## What it does

1. **Landing** — Connect with Google
2. **OAuth** — inbox.dog handles Google; you never touch Google directly
3. **Chat** — ai + agents with one tool: `run_gmail_script`
4. **The trick** — Instead of N tools (list, get, search, send...), the agent emits a single script. We run it in a sandboxed Gmail context. One tool, arbitrary Gmail logic. (Worker Loaders can add stronger isolation.)

## Stack

- **ai** — Vercel AI SDK
- **agents** — generateText + tools + maxSteps
- **inbox.dog** — Gmail OAuth + API
- Astro + Cloudflare Pages + KV

## Self-hosting

This demo does **not** auto-generate credentials. If you self-host:

1. Create an app: `bun scripts/create-key.ts my-app` (or `curl -X POST https://inbox.dog/api/keys -H "Content-Type: application/json" -d '{"name":"my-app"}'`)
2. Create a key at [Anthropic](https://console.anthropic.com) — get `ANTHROPIC_API_KEY`
3. Create a KV namespace: `npx wrangler kv namespace create SESSIONS`
4. Add credentials to `wrangler.json` (or env) and the KV namespace ID
5. Deploy

Credentials stay server-side. Users never see them.

### Deploy steps

```bash
cd examples/gmail-chat

# 1. Create KV namespace (if not done)
npx wrangler kv namespace create SESSIONS
# Copy the id from output, put in wrangler.json under kv_namespaces[0].id

# 2. Build
bun run build

# 3. Deploy
npx wrangler pages deploy dist --project-name gmail-chat
```

Then in [Cloudflare Dashboard](https://dash.cloudflare.com) > Pages > gmail-chat > Settings > Environment variables, add:

- `INBOX_DOG_CLIENT_ID`
- `INBOX_DOG_CLIENT_SECRET`
- `ANTHROPIC_API_KEY`

**OAuth:** Add `https://<your-pages-url>/callback` to your key's redirect URIs at inbox.dog (or use a key created with that URI).

**Note:** `astro build` may hit a Vite bug locally. Cloudflare's build env sometimes succeeds; if not, try from a fresh clone.

## Tech stack

| Layer      | Choice                          |
|-----------|----------------------------------|
| AI        | ai (Vercel AI SDK)               |
| Agents    | ai SDK agents (ToolLoopAgent)    |
| Gmail     | inbox.dog                        |
| Frontend  | Astro (SSR)                      |
| Hosting   | Cloudflare Pages                 |
| Sessions  | KV                              |
