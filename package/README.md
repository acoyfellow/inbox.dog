# inbox.dog

Gmail OAuth tokens in 3 API calls. No Google Cloud console required.

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
  scope: "email",
});
// → redirect user to `url`

// 3. Exchange the code from callback for tokens
const tokens = await dog.exchangeCode(code, key.client_id, key.client_secret);
// → { access_token, refresh_token, email, expires_in }

// Use tokens directly with Gmail API
const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages", {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
});
```

## API

### `new InboxDog(options?)`

| Option    | Type       | Default               |
|-----------|------------|-----------------------|
| `baseUrl` | `string`   | `https://inbox.dog`   |
| `fetch`   | `Function` | `globalThis.fetch`    |

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

Create a Stripe checkout session. Returns `{ checkout_url, session_id }`.

## Errors

All errors throw `InboxDogError` with these properties:

| Property  | Type     | Description            |
|-----------|----------|------------------------|
| `code`    | `string` | Machine-readable code  |
| `status`  | `number` | HTTP status code       |
| `message` | `string` | Human-readable message |
| `action`  | `string` | Suggested fix          |
| `docs`    | `string` | Link to docs           |

Error codes: `INVALID_CREDENTIALS` (401), `INSUFFICIENT_CREDITS` (402), `VALIDATION_ERROR` (400), `STATE_NOT_FOUND` (400), `AUTH_CODE_NOT_FOUND` (400), `TOKEN_EXCHANGE_FAILED` (500).

```ts
try {
  await dog.exchangeCode(code, clientId, clientSecret);
} catch (e) {
  if (e instanceof InboxDogError && e.code === "INSUFFICIENT_CREDITS") {
    const { checkout_url } = await dog.checkout(clientId, clientSecret);
    // redirect user to checkout_url
  }
}
```

## Links

- Docs: https://inbox.dog/docs
- API Reference: https://inbox.dog/docs/api
- GitHub: https://github.com/acoyfellow/inbox.dog
- MCP Server: `npx @inboxdog/mcp-server`
