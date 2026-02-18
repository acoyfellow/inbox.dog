import { Schema } from 'effect';

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export const ApiKeySchema = Schema.Struct({
  id: Schema.String,
  clientId: Schema.String,
  clientSecret: Schema.String,
  name: Schema.String,
  createdAt: Schema.Number,
  credits: Schema.Number,
  stripeCustomerId: Schema.optional(Schema.String),
  redirectUris: Schema.optional(Schema.Array(Schema.String)),
});

export type ApiKey = Schema.Schema.Type<typeof ApiKeySchema>;

// ---------------------------------------------------------------------------
// OAuth state (stored in KV during the authorization flow)
// ---------------------------------------------------------------------------

export const OAuthStateSchema = Schema.Struct({
  clientId: Schema.String,
  redirectUri: Schema.String,
  scope: Schema.String,
  state: Schema.String,
  createdAt: Schema.Number,
  codeChallenge: Schema.optional(Schema.String),
  codeChallengeMethod: Schema.optional(Schema.String),
});

export type OAuthState = Schema.Schema.Type<typeof OAuthStateSchema>;

// ---------------------------------------------------------------------------
// Token response (our normalized shape returned to clients)
// ---------------------------------------------------------------------------

export const TokenResponseSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresIn: Schema.Number,
  email: Schema.String,
});

export type TokenResponse = Schema.Schema.Type<typeof TokenResponseSchema>;

// ---------------------------------------------------------------------------
// Auth code data (stored encrypted in KV between authorize ↔ token exchange)
// ---------------------------------------------------------------------------

export const AuthCodeDataSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresIn: Schema.Number,
  email: Schema.String,
  clientId: Schema.String,
  codeChallenge: Schema.optional(Schema.String),
  codeChallengeMethod: Schema.optional(Schema.String),
});

export type AuthCodeData = Schema.Schema.Type<typeof AuthCodeDataSchema>;

// ---------------------------------------------------------------------------
// MCP session data (stored in KV for Model Context Protocol sessions)
// Shape actually stored: { accessToken, refreshToken, expiresAt, email, clientId }
// ---------------------------------------------------------------------------

export const McpStoredSessionSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAt: Schema.Number,
  email: Schema.String,
  clientId: Schema.optional(Schema.String),
});

export type McpStoredSession = Schema.Schema.Type<typeof McpStoredSessionSchema>;

/** @deprecated Use McpStoredSessionSchema for new code. Kept for backward compat. */
export const McpSessionDataSchema = McpStoredSessionSchema;

export type McpSessionData = McpStoredSession;

// ---------------------------------------------------------------------------
// Bind session (short-lived, used during Connect Gmail web flow)
// ---------------------------------------------------------------------------

export const BindSessionSchema = Schema.Struct({
  clientId: Schema.String,
  clientSecret: Schema.String,
});

export type BindSession = Schema.Schema.Type<typeof BindSessionSchema>;

// ---------------------------------------------------------------------------
// Gmail tokens stored per API key (web bind flow)
// Same shape as McpStoredSession, keyed by client_id
// ---------------------------------------------------------------------------

export const GmailTokensSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAt: Schema.Number,
  email: Schema.String,
});

export type GmailTokens = Schema.Schema.Type<typeof GmailTokensSchema>;

// ---------------------------------------------------------------------------
// Google API response schemas
// ---------------------------------------------------------------------------

export const GoogleTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  token_type: Schema.String,
});

export type GoogleTokenResponse = Schema.Schema.Type<typeof GoogleTokenResponseSchema>;

export const GoogleRefreshTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
  token_type: Schema.String,
});

export type GoogleRefreshTokenResponse = Schema.Schema.Type<typeof GoogleRefreshTokenResponseSchema>;

export const GoogleUserInfoSchema = Schema.Struct({
  email: Schema.String,
  verified_email: Schema.optional(Schema.Boolean),
});

export type GoogleUserInfo = Schema.Schema.Type<typeof GoogleUserInfoSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateKeyRequestSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  redirect_uris: Schema.optional(Schema.Array(Schema.String)),
});

export type CreateKeyRequest = Schema.Schema.Type<typeof CreateKeyRequestSchema>;

export const TokenExchangeRequestSchema = Schema.Struct({
  code: Schema.String,
  client_id: Schema.String,
  client_secret: Schema.String,
});

export type TokenExchangeRequest = Schema.Schema.Type<typeof TokenExchangeRequestSchema>;

export const RefreshTokenRequestSchema = Schema.Struct({
  grant_type: Schema.Literal('refresh_token'),
  refresh_token: Schema.String,
  client_id: Schema.String,
  client_secret: Schema.String,
});

export type RefreshTokenRequest = Schema.Schema.Type<typeof RefreshTokenRequestSchema>;

export const CheckoutRequestSchema = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
  credits: Schema.optional(Schema.Number),
});

export type CheckoutRequest = Schema.Schema.Type<typeof CheckoutRequestSchema>;

// ---------------------------------------------------------------------------
// Stripe webhook event (lightweight — we only need a few fields)
// ---------------------------------------------------------------------------

export const StripeWebhookEventSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  data: Schema.Struct({
    object: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  }),
});

export type StripeWebhookEvent = Schema.Schema.Type<typeof StripeWebhookEventSchema>;
