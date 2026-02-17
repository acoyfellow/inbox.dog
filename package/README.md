# inbox.dog

Gmail OAuth + typed client. No Google Cloud console required.

```
npm install inbox.dog
```

## Quick start

```ts
import { InboxDog } from "inbox.dog";

const dog = new InboxDog();

// 1. Create an API key (one-time)
const key = await dog.createKey("my-app");
// → { client_id, client_secret, name, credits: 10 }

// 2. Redirect user to Gmail consent
const url = dog.getAuthUrl({
  clientId: key.client_id,
  redirectUri: "http://localhost:3000/callback",
  scope: "email:full",
});
// → redirect user to `url`

// 3. Exchange the code from callback for tokens
const tokens = await dog.exchangeCode(code, key.client_id, key.client_secret);
// → { access_token, refresh_token, email, expires_in }

// 4. Use Gmail
const gmail = dog.gmail(tokens);
const unread = await gmail.list({ query: "is:unread", max: 5 });
```

## Gmail client

The `Gmail` class wraps the Gmail REST API so you never deal with MIME encoding, base64, or nested payload parsing.

### With inbox.dog OAuth

```ts
const dog = new InboxDog();
const tokens = await dog.exchangeCode(code, clientId, clientSecret);
const gmail = dog.gmail(tokens);
```

### Standalone (bring your own token)

```ts
import { Gmail } from "inbox.dog";

const gmail = new Gmail({ access_token: "ya29...." });
```

### For agents

```ts
import { Gmail } from "inbox.dog";

const gmail = new Gmail({
  access_token: process.env.GMAIL_ACCESS_TOKEN!,
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  client_id: process.env.INBOX_DOG_CLIENT_ID,
  client_secret: process.env.INBOX_DOG_CLIENT_SECRET,
});

// agent can now read, search, send, label, archive...
```

### Reading emails

```ts
// List recent emails
const result = await gmail.list({ query: "is:unread", max: 10 });
// → { messages: EmailSummary[], total: number, nextPageToken? }

// Get full email content
const email = await gmail.get("msg_id");
// → { id, from, to, subject, date, body, labelIds, ... }

// Search
const invoices = await gmail.search("subject:invoice has:attachment");
```

### Sending emails

```ts
await gmail.send({
  to: "alice@example.com",
  subject: "hello",
  body: "no MIME encoding needed",
});

// Multiple recipients
await gmail.send({
  to: ["alice@example.com", "bob@example.com"],
  cc: "charlie@example.com",
  subject: "group email",
  body: "hello everyone",
});

// Reply to a thread
await gmail.send({
  to: "alice@example.com",
  subject: "Re: Original subject",
  body: "reply body",
  replyTo: "<original-message-id@gmail.com>",
  threadId: "thread_abc",
});
```

### Labels and organization

```ts
const labels = await gmail.labels();

await gmail.addLabels("msg_id", ["Label_123"]);
await gmail.removeLabels("msg_id", ["Label_123"]);

// Convenience methods
await gmail.archive("msg_id");
await gmail.archive(["msg_1", "msg_2"]); // batch
await gmail.markRead("msg_id");
await gmail.markUnread("msg_id");
await gmail.trash("msg_id");
await gmail.untrash("msg_id");
```

### Drafts

```ts
const draft = await gmail.createDraft({
  to: "bob@example.com",
  subject: "saved for later",
  body: "draft content",
});

const drafts = await gmail.listDrafts({ max: 5 });
```

### Attachments

```ts
const atts = await gmail.attachments("msg_id");
// → [{ id, filename, mimeType, size }]

const data = await gmail.attachment("msg_id", atts[0].id);
// → { id, filename, mimeType, size, data: Uint8Array }
```

### Profile

```ts
const me = await gmail.profile();
// → { emailAddress, messagesTotal, threadsTotal, historyId }
```

### Batch operations

```ts
await gmail.batchModify({
  ids: ["msg_1", "msg_2", "msg_3"],
  addLabelIds: ["Label_1"],
  removeLabelIds: ["INBOX"],
});
```

## OAuth API

### `new InboxDog(options?)`

| Option    | Type       | Default             |
|-----------|------------|---------------------|
| `baseUrl` | `string`   | `https://inbox.dog` |
| `fetch`   | `Function` | `globalThis.fetch`  |

### `createKey(name?): Promise<CreateKeyResponse>`

Create a new API key. Returns `{ client_id, client_secret, name, credits }`.

### `getKey(clientId, clientSecret): Promise<KeyInfo>`

Get key info. Returns `{ client_id, name, credits, created_at }`.

### `getAuthUrl(opts): string`

Build the OAuth authorization URL. No network request.

| Param         | Type     | Required |
|---------------|----------|----------|
| `clientId`    | `string` | yes      |
| `redirectUri` | `string` | yes      |
| `scope`       | `Scope`  | no       |
| `state`       | `string` | no       |

Scopes: `"email"` (default, read-only), `"email:read"`, `"email:send"`, `"email:full"`.

### `exchangeCode(code, clientId, clientSecret): Promise<TokenResponse>`

Exchange auth code for tokens. Costs 1 credit.
Returns `{ access_token, refresh_token, token_type, expires_in, email }`.

### `refreshToken(refreshToken, clientId, clientSecret): Promise<RefreshResponse>`

Refresh an expired access token. Free.
Returns `{ access_token, token_type, expires_in }`.

### `checkout(clientId, clientSecret, credits?): Promise<CheckoutResponse>`

Create a Stripe checkout session.
Returns `{ checkout_url, session_id }`.

### `gmail(tokens, opts?): Gmail`

Create a typed Gmail client from tokens. Accepts `TokenResponse` from `exchangeCode()` or raw `GmailTokens`.

## Errors

All OAuth errors throw `InboxDogError`. All Gmail errors throw `GmailError`.

```ts
import { InboxDogError, GmailError } from "inbox.dog";

try {
  await gmail.send({ to: "a@b.com", subject: "hi", body: "hello" });
} catch (e) {
  if (e instanceof GmailError) {
    console.log(e.status, e.message);
  }
}
```

## Examples

### [MCP Gmail Server](https://github.com/acoyfellow/inbox.dog/tree/main/examples/mcp-gmail)

Expose Gmail as MCP tools for Claude Desktop, Cursor, or any MCP client. Stateless Cloudflare Worker — ~80 lines.

### [Chat Agent](https://github.com/acoyfellow/inbox.dog/tree/main/examples/chat-agent)

Talk to your inbox in natural language. "What's unread?" / "Archive all newsletters." Built with Cloudflare Agents + Anthropic — ~70 lines.

### [Auto-Triage](https://github.com/acoyfellow/inbox.dog/tree/main/examples/auto-triage)

Scheduled agent that classifies and triages unread email every 5 minutes using Workers AI — ~80 lines.

### [AI Email Agent](https://github.com/acoyfellow/inbox.dog/tree/main/examples/ai-email-agent)

Standalone script that triages email with Claude. No deployment needed — `npx tsx index.ts`.

## Links

- Docs: https://inbox.dog/docs
- API Reference: https://inbox.dog/docs/api
- GitHub: https://github.com/acoyfellow/inbox.dog
- MCP Server: `npx @inboxdog/mcp-server`
