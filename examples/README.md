# inbox.dog Examples

Reference implementations for **consumers** of the hosted inbox.dog API at https://inbox.dog.

These examples use the public API only — no self-hosted configuration. They demonstrate the intended integration patterns.

| Example | Description |
|---------|-------------|
| [ai-email-agent](./ai-email-agent) | AI agent that triages Gmail with Claude. Local + Workers deploy. |
| [astro-cloudflare](./astro-cloudflare) | Gmail OAuth flow in Astro, deployed to Cloudflare Pages. |
| [gmail-chat](./gmail-chat) | Chat with your inbox: Cloudflare Agents SDK + AI SDK + inbox.dog. DO, streaming, one script tool. |
