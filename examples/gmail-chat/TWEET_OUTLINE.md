# Tweet outline: Gmail Chat example

**Hook (first line):**
- "Shipped an open-source example: chat with your Gmail using AI and one sandboxed tool."
- Or: "One tool, infinite Gmail — new example in the inbox.dog repo."

**What it is:**
- Gmail Chat: connect with Google (inbox.dog OAuth), then talk to an AI that can read/search/summarize your inbox.
- Single tool: the agent writes a small JS async arrow; it runs in a Cloudflare Worker Loader (sandbox, no network); inside the arrow it calls gmail_get/gmail_post. No N separate tools.

**Stack (for dev audience):**
- Vercel AI SDK, Cloudflare Agents (Durable Objects), Workers AI (e.g. glm-4.7-flash), Worker Loaders for the sandbox, inbox.dog for Gmail OAutitsh.

**CTA:**
- Try it: [Deploy to Cloudflare] link or "Clone and run in a few minutes."
- Repo: github.com/acoyfellow/inbox.dog → examples/gmail-chat

**Short draft (under 280):**
"Shipped a Gmail Chat example: OAuth with inbox.dog, then chat with your inbox. One tool—the agent writes JS that runs in a Worker Loader sandbox and calls Gmail. AI SDK + Cloudflare Agents + Workers AI. Deploy or clone: [link]"

**Alternative (thread):**
1. We added a full example: Gmail Chat. Connect Gmail (OAuth via inbox.dog), then talk to an AI that can read and act on your inbox.
2. The trick: one tool. The agent writes a tiny JS async arrow; it runs in a sandboxed Worker Loader; inside it only has gmail_get / gmail_post. No 20 separate tools.
3. Stack: Vercel AI SDK, Cloudflare Agents (Durable Objects), Workers AI, Worker Loaders, inbox.dog. Single Worker, open source. Deploy: [button] or repo: examples/gmail-chat
