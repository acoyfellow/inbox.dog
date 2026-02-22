export interface Env {
  KV: KVNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ENCRYPTION_SECRET: string;
  ALLOWED_ORIGINS?: string; // comma-separated, e.g. "https://inbox.dog,http://localhost:3000"
}
