/// <reference types="vite/client" />

interface Env {
  INBOX_AGENT: DurableObjectNamespace;
  ASSETS: Fetcher;
  LOADER: WorkerLoader;
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
}
