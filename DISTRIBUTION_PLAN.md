# inbox.dog Distribution Plan

**Goal:** Get inbox.dog listed on every major MCP directory. Currently listed on **zero**.

**Status:** Config files added to repo, manual submissions ready to execute.

---

## Repo Changes (done)

| File | Purpose |
|------|---------|
| `glama.json` | Claim ownership on Glama after listing |
| `smithery.yaml` | Smithery registry config |
| `server.json` | Official MCP Registry manifest |
| `package/package.json` | Added `mcpName` for registry verification |

---

## Directory Submissions

### 1. awesome-mcp-servers → Glama.ai (two-for-one)

**Priority:** HIGH — a single PR gets you listed on both awesome-mcp-servers AND Glama.ai.

**Action:** Submit PR to [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)

**Where to add:** Under the "Communication" or "Email" category, in alphabetical order.

**Line to add:**
```markdown
- [inbox.dog](https://github.com/acoyfellow/inbox.dog) 📇 ☁️ - Gmail MCP server with built-in OAuth. Read, search, and send emails — no Google Cloud setup required.
```

**Emoji key:** `📇` = TypeScript, `☁️` = Cloud service

**After merge:** Visit your server page on Glama → "Claim ownership" → authenticate with GitHub. The `glama.json` in the repo root confirms you as maintainer.

---

### 2. Smithery.ai

**Priority:** HIGH — large user base, good analytics.

**Option A: Publish via URL (fastest)**
1. Go to [smithery.ai/new](https://smithery.ai/new)
2. Sign in with GitHub
3. Enter URL: `https://inbox.dog/mcp`
4. Smithery will discover the server's capabilities via the MCP endpoint
5. Fill in metadata if prompted

**Option B: CLI publish**
```bash
npm install -g @anthropic-ai/smithery-cli  # or npx
smithery login
smithery publish
```
The `smithery.yaml` in the repo root provides the config.

**Server card endpoint (optional enhancement):**
Add `/.well-known/mcp/server-card.json` to the worker for richer metadata:
```json
{
  "serverInfo": { "name": "inbox.dog", "version": "0.2.0" },
  "description": "Gmail MCP server with built-in OAuth. Read, search, and send emails.",
  "authentication": { "type": "oauth2" },
  "tools": ["read_emails", "read_email", "send_email", "search_emails", "get_profile"]
}
```

---

### 3. mcp.so

**Priority:** MEDIUM — 17,500+ servers listed, good SEO.

**Action:** Comment on [Submit Your MCP Servers here (Issue #1)](https://github.com/chatmcp/mcp-directory/issues/1)

**Comment template:**
```
## inbox.dog — Gmail MCP Server

**URL:** https://inbox.dog
**GitHub:** https://github.com/acoyfellow/inbox.dog
**MCP Endpoint:** https://inbox.dog/mcp
**Category:** Email / Communication

### Description
Gmail MCP server with built-in OAuth authentication. Gives any MCP client
(Claude Desktop, Cursor, etc.) the ability to read, search, and send emails
through Gmail — without needing a Google Cloud project or OAuth setup.

### Tools
- `read_emails` — List recent emails with search/label filters
- `read_email` — Read full email content by message ID
- `send_email` — Send email (to, subject, body, cc, bcc)
- `search_emails` — Search using Gmail search syntax
- `get_profile` — Get authenticated user's Gmail profile

### Features
- OAuth 2.1 with PKCE (no API keys to configure)
- RFC 9728 resource metadata for auto-discovery
- Token refresh handled server-side
- AES-256-GCM encrypted token storage
- Open source (MIT), self-hostable on Cloudflare Workers
```

---

### 4. mcphub.io

**Priority:** MEDIUM — smaller directory, but worth listing.

**Action:** Open issue on [MCP-Club/mcphub](https://github.com/MCP-Club/mcphub)

**Issue title:** `Add inbox.dog — Gmail MCP Server with built-in OAuth`

**Issue body:** Same content as the mcp.so comment above.

---

### 5. Official MCP Registry (registry.modelcontextprotocol.io)

**Priority:** HIGH — this is becoming the canonical registry.

**Prerequisites:**
- npm package `inbox.dog` must be published with `mcpName: "dog.inbox/mcp"` in package.json ✅ (added)
- `server.json` must be in repo root ✅ (added)

**Steps:**
```bash
# 1. Install the publisher CLI
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/

# 2. Authenticate with GitHub
mcp-publisher login github

# 3. Validate
mcp-publisher publish --dry-run

# 4. Publish
mcp-publisher publish
```

**Note:** Before publishing, bump and release the npm package with the `mcpName` field:
```bash
cd package
npm version patch
npm publish
```

---

### 6. modelcontextprotocol/servers (Official GitHub repo)

**Priority:** LOW — the README's third-party section is deprecated in favor of the registry above. Skip unless the registry publish fails.

---

## Execution Order

| # | Directory | Method | Effort | Impact |
|---|-----------|--------|--------|--------|
| 1 | awesome-mcp-servers + Glama | GitHub PR | 5 min | HIGH — two listings from one PR |
| 2 | Smithery | Web form at smithery.ai/new | 5 min | HIGH — instant listing |
| 3 | mcp.so | GitHub issue comment | 5 min | MEDIUM — good SEO |
| 4 | Official MCP Registry | CLI publish | 15 min | HIGH — canonical registry |
| 5 | mcphub.io | GitHub issue | 5 min | MEDIUM |
| 6 | modelcontextprotocol/servers | Skip | — | DEPRECATED |

**Total manual work remaining:** ~35 min of form-filling and CLI commands.

---

## Future: MCP App (interactive inbox UI)

Beyond directory listings, ship an **MCP App** that renders an interactive email inbox UI inside MCP hosts (Claude Desktop, etc.). User says "show me my inbox" → rich HTML email viewer renders inline. This is the "wow" demo that differentiates inbox.dog from raw tool listings.

**Implementation ideas:**
- Return structured HTML/markdown from tools that MCP hosts can render
- Build a dedicated "inbox viewer" resource that MCP hosts display as a panel
- Leverage MCP's resource subscription for real-time email notifications

This is Phase 2 — get listed first, then build the demo that drives adoption.
