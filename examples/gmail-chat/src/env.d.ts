/// <reference path="../.astro/types.d.ts" />

interface CloudflareRuntimeEnv {
  INBOX_AGENT?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  };
}

declare namespace App {
  interface Locals {
    runtime?: { env?: CloudflareRuntimeEnv };
  }
}