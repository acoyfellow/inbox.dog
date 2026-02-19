#!/usr/bin/env bun
/**
 * Create an inbox.dog API key.
 * Usage: bun scripts/create-key.ts [name]
 *        bun run create-key [name]
 */

const name = process.argv[2] || "default";
const base = process.env.INBOX_DOG_URL || "https://inbox.dog";

const res = await fetch(`${base}/api/keys`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name }),
});

const data = await res.json();
if (!res.ok) {
  console.error("Error:", data);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
console.log("\nEnv:");
console.log(`INBOX_DOG_CLIENT_ID=${data.client_id}`);
console.log(`INBOX_DOG_CLIENT_SECRET=${data.client_secret}`);
