import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboxDog, InboxDogError, createClient } from "./index";

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("InboxDog", () => {
  describe("constructor", () => {
    it("uses default base URL", () => {
      const dog = new InboxDog();
      const url = dog.getAuthUrl({ clientId: "test", redirectUri: "http://localhost" });
      expect(url).toContain("https://inbox.dog/oauth/authorize");
    });

    it("accepts custom base URL", () => {
      const dog = new InboxDog({ baseUrl: "https://custom.example.com" });
      const url = dog.getAuthUrl({ clientId: "test", redirectUri: "http://localhost" });
      expect(url).toContain("https://custom.example.com/oauth/authorize");
    });

    it("strips trailing slashes from base URL", () => {
      const dog = new InboxDog({ baseUrl: "https://example.com///" });
      const url = dog.getAuthUrl({ clientId: "test", redirectUri: "http://localhost" });
      expect(url).toContain("https://example.com/oauth/authorize");
    });
  });

  describe("getAuthUrl", () => {
    const dog = new InboxDog();

    it("builds URL with required params", () => {
      const url = dog.getAuthUrl({
        clientId: "id_abc",
        redirectUri: "http://localhost:3000/callback",
      });
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/oauth/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("id_abc");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback");
    });

    it("includes scope when provided", () => {
      const url = dog.getAuthUrl({
        clientId: "id_abc",
        redirectUri: "http://localhost/cb",
        scope: "email:read",
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.get("scope")).toBe("email:read");
    });

    it("includes state when provided", () => {
      const url = dog.getAuthUrl({
        clientId: "id_abc",
        redirectUri: "http://localhost/cb",
        state: "random_csrf_token",
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.get("state")).toBe("random_csrf_token");
    });

    it("omits scope and state when not provided", () => {
      const url = dog.getAuthUrl({
        clientId: "id_abc",
        redirectUri: "http://localhost/cb",
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.has("scope")).toBe(false);
      expect(parsed.searchParams.has("state")).toBe(false);
    });
  });

  describe("createKey", () => {
    it("posts to /api/keys with name", async () => {
      const response = { client_id: "id_abc", client_secret: "sk_abc", name: "myapp", credits: 10 };
      const fetch = mockFetch(response);
      const dog = new InboxDog({ fetch });

      const result = await dog.createKey("myapp");

      expect(fetch).toHaveBeenCalledWith(
        "https://inbox.dog/api/keys",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "myapp" }),
        }),
      );
      expect(result).toEqual(response);
    });

    it("defaults name to 'default'", async () => {
      const fetch = mockFetch({ client_id: "id_abc", client_secret: "sk_abc", name: "default", credits: 10 });
      const dog = new InboxDog({ fetch });

      await dog.createKey();

      expect(fetch).toHaveBeenCalledWith(
        "https://inbox.dog/api/keys",
        expect.objectContaining({
          body: JSON.stringify({ name: "default" }),
        }),
      );
    });
  });

  describe("getKey", () => {
    it("fetches key info with secret header", async () => {
      const response = { client_id: "id_abc", name: "myapp", credits: 8, created_at: 1700000000 };
      const fetch = mockFetch(response);
      const dog = new InboxDog({ fetch });

      const result = await dog.getKey("id_abc", "sk_abc");

      expect(fetch).toHaveBeenCalledWith(
        "https://inbox.dog/api/keys/id_abc",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Client-Secret": "sk_abc",
          }),
        }),
      );
      expect(result).toEqual(response);
    });
  });

  describe("exchangeCode", () => {
    it("posts code exchange to /oauth/token", async () => {
      const response = {
        access_token: "ya29.xxx",
        refresh_token: "1//xxx",
        token_type: "Bearer" as const,
        expires_in: 3599,
        email: "user@gmail.com",
      };
      const fetch = mockFetch(response);
      const dog = new InboxDog({ fetch });

      const result = await dog.exchangeCode("auth_code_123", "id_abc", "sk_abc");

      expect(fetch).toHaveBeenCalledWith(
        "https://inbox.dog/oauth/token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            code: "auth_code_123",
            client_id: "id_abc",
            client_secret: "sk_abc",
          }),
        }),
      );
      expect(result).toEqual(response);
    });
  });

  describe("refreshToken", () => {
    it("posts refresh request to /oauth/token", async () => {
      const response = { access_token: "ya29.new", token_type: "Bearer" as const, expires_in: 3599 };
      const fetch = mockFetch(response);
      const dog = new InboxDog({ fetch });

      const result = await dog.refreshToken("1//refresh_tok", "id_abc", "sk_abc");

      expect(fetch).toHaveBeenCalledWith(
        "https://inbox.dog/oauth/token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: "1//refresh_tok",
            client_id: "id_abc",
            client_secret: "sk_abc",
          }),
        }),
      );
      expect(result).toEqual(response);
    });
  });

  describe("error handling", () => {
    it("throws InboxDogError on API error response", async () => {
      const fetch = mockFetch(
        { error: { code: "NO_CREDITS", message: "Buy more credits", action: "POST /api/checkout", docs: "https://inbox.dog/docs/errors" } },
        402,
      );
      const dog = new InboxDog({ fetch });

      try {
        await dog.exchangeCode("code", "id", "sk");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(InboxDogError);
        const err = e as InboxDogError;
        expect(err.code).toBe("NO_CREDITS");
        expect(err.message).toBe("Buy more credits");
        expect(err.status).toBe(402);
        expect(err.action).toBe("POST /api/checkout");
        expect(err.docs).toBe("https://inbox.dog/docs/errors");
        expect(err.name).toBe("InboxDogError");
      }
    });

    it("handles error response without error wrapper", async () => {
      const fetch = mockFetch({ message: "Server error" }, 500);
      const dog = new InboxDog({ fetch });

      try {
        await dog.createKey();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(InboxDogError);
        const err = e as InboxDogError;
        expect(err.code).toBe("UNKNOWN");
        expect(err.status).toBe(500);
      }
    });
  });

  describe("createClient", () => {
    it("returns an InboxDog instance", () => {
      const client = createClient();
      expect(client).toBeInstanceOf(InboxDog);
    });

    it("passes options through", () => {
      const client = createClient({ baseUrl: "https://custom.com" });
      const url = client.getAuthUrl({ clientId: "x", redirectUri: "http://localhost" });
      expect(url).toContain("https://custom.com/");
    });
  });
});
