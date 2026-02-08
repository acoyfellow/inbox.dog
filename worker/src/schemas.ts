import { Schema } from '@effect/schema';

// API Key schema
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

// OAuth state schema
export const OAuthStateSchema = Schema.Struct({
  clientId: Schema.String,
  redirectUri: Schema.String,
  scope: Schema.String,
  state: Schema.String,
  createdAt: Schema.Number,
});

export type OAuthState = Schema.Schema.Type<typeof OAuthStateSchema>;

// Token response schema
export const TokenResponseSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresIn: Schema.Number,
  email: Schema.String,
});

export type TokenResponse = Schema.Schema.Type<typeof TokenResponseSchema>;

// Google token response schema
export const GoogleTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  token_type: Schema.String,
});

// Google user info schema
export const GoogleUserInfoSchema = Schema.Struct({
  email: Schema.String,
  verified_email: Schema.optional(Schema.Boolean),
});

// Request schemas
export const CreateKeyRequestSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  redirect_uris: Schema.optional(Schema.Array(Schema.String)),
});

export const TokenExchangeRequestSchema = Schema.Struct({
  code: Schema.String,
  client_id: Schema.String,
  client_secret: Schema.String,
});

export const RefreshTokenRequestSchema = Schema.Struct({
  grant_type: Schema.Literal('refresh_token'),
  refresh_token: Schema.String,
  client_id: Schema.String,
  client_secret: Schema.String,
});

export const CheckoutRequestSchema = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
  credits: Schema.optional(Schema.Number),
});
