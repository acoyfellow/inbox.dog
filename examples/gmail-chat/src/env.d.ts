/// <reference types="vite/client" />

interface Env {
  INBOX_AGENT: DurableObjectNamespace;
  ASSETS: Fetcher;
  LOADER: WorkerLoader;
  AI: Ai;
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
}
