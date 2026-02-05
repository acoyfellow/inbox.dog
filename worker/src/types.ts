export interface Env {
  // KV namespace
  KV: KVNamespace;

  // Assets binding for static files
  ASSETS: Fetcher;

  // Environment variables
  ENVIRONMENT: string;

  // Secrets
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
}

export interface OAuthState {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  createdAt: number;
}

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  clientId: string;
}

export interface ApiKey {
  id: string;
  clientId: string;
  clientSecret: string;
  name: string;
  createdAt: number;
  credits: number;
  stripeCustomerId?: string;
}
