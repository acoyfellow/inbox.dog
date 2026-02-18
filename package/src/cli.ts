#!/usr/bin/env bun
/**
 * inbox.dog stdio MCP proxy.
 * Reads JSON-RPC from stdin, proxies to https://inbox.dog/mcp with API key auth.
 *
 * Usage:
 *   INBOX_DOG_CLIENT_ID=xxx INBOX_DOG_CLIENT_SECRET=yyy npx inbox.dog mcp
 *   npx inbox.dog mcp  # reads from env
 *
 * Configure in Claude Desktop / Cursor: command "npx", args ["inbox.dog", "mcp"],
 * env: INBOX_DOG_CLIENT_ID, INBOX_DOG_CLIENT_SECRET.
 */

const MCP_URL = process.env.INBOX_DOG_BASE_URL ?? "https://inbox.dog";
const clientId = process.env.INBOX_DOG_CLIENT_ID;
const clientSecret = process.env.INBOX_DOG_CLIENT_SECRET;

function getBearerToken(): string {
  if (!clientId || !clientSecret) {
    console.error(
      "Error: INBOX_DOG_CLIENT_ID and INBOX_DOG_CLIENT_SECRET must be set.\n" +
        "Create a key at https://inbox.dog/connect, then Connect Gmail."
    );
    process.exit(1);
  }
  const encoded = btoa(`${clientId}:${clientSecret}`);
  return encoded;
}

async function proxyRequest(line: string): Promise<string> {
  let body: unknown;
  try {
    body = JSON.parse(line);
  } catch {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }

  const bearer = getBearerToken();
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: line,
  });

  const text = await res.text();
  if (!res.ok) {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: typeof body === "object" && body !== null && "id" in body ? (body as { id: unknown }).id : null,
      error: { code: -32001, message: `HTTP ${res.status}: ${text}` },
    });
  }
  return text;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "mcp") {
    console.error(
      "Usage: npx inbox.dog mcp\n" +
        "  Requires: INBOX_DOG_CLIENT_ID, INBOX_DOG_CLIENT_SECRET\n" +
        "  Create a key and connect Gmail at https://inbox.dog/connect"
    );
    process.exit(1);
  }

  getBearerToken(); // Validate env before entering read loop

  const rl = await import("node:readline").then((m) =>
    m.createInterface({ input: process.stdin, crlfDelay: Infinity })
  );

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const out = await proxyRequest(trimmed);
      process.stdout.write(out + "\n");
    } catch (err) {
      const id = (() => {
        try {
          const parsed = JSON.parse(trimmed) as { id?: unknown };
          return parsed?.id ?? null;
        } catch {
          return null;
        }
      })();
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
        }) + "\n"
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
