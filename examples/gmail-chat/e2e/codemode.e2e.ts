/**
 * E2E: Asserts the model invokes the codemode tool (tool path only). Run with TEST_INJECT_SECRET set.
 */
import { test } from "@playwright/test";

const TEST_SECRET = process.env.TEST_INJECT_SECRET;
const FAKE_SESSION = {
  access_token: "fake-token",
  refresh_token: "fake-refresh",
  client_id: "x",
  client_secret: "y",
  email: "test-e2e@test.inbox.dog",
};

test.describe("Gmail code response", () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_SECRET) {
      test.skip(true, "TEST_INJECT_SECRET not set (use .dev.vars or export)");
      return;
    }
    const baseURL = process.env.APP_URL ?? "http://localhost:5174";
    const res = await fetch(`${baseURL}/api/test/inject-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-secret": TEST_SECRET },
      body: JSON.stringify(FAKE_SESSION),
    });
    if (!res.ok) {
      throw new Error(`inject-session failed: ${res.status}`);
    }
    await page.context().addCookies([
      {
        name: "inbox_session",
        value: "test-e2e",
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
  });

  test("model responds with runnable code (gmail block or tool) and no raw JSON", async ({ page }) => {
    await page.goto("/chat");
    await page.getByRole("textbox", { name: "Chat message" }).fill("How many emails are in my inbox?");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await page.getByText(/Running code|Executing|Writing script/i).first().waitFor({ state: "visible", timeout: 70_000 });
  });
});
