export interface Env {
  KV: KVNamespace;
  ASSETS: Fetcher;

  // Durable Object for analytics
  ANALYTICS: DurableObjectNamespace;

  ENVIRONMENT: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ENCRYPTION_SECRET: string;
  ANALYTICS_SECRET?: string;
}
