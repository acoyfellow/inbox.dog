import { beforeEach, describe, expect, it, vi } from "vitest";

const getEmail = vi.fn();
const GmailMock = vi.fn().mockImplementation(() => ({ getEmail }));
(GmailMock as unknown as { api: Record<string, unknown> }).api = { getEmail: true };

vi.mock("inbox.dog", () => ({
  Gmail: GmailMock,
}));
vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {},
}));

describe("GmailBridge", () => {
  beforeEach(() => {
    getEmail.mockReset();
    GmailMock.mockClear();
  });

  it("creates a Gmail client from props and calls allowed methods", async () => {
    getEmail.mockResolvedValue({ id: "email-1" });
    const { GmailBridge } = await import("./GmailBridge");

    const result = await GmailBridge.prototype.call.call(
      {
        ctx: {
          props: {
            sessionId: "user_1",
            access_token: "access",
            refresh_token: "refresh",
            client_id: "client",
            client_secret: "secret",
          },
        },
      },
      "getEmail",
      ["email-1"]
    );

    expect(GmailMock).toHaveBeenCalledWith(
      {
        access_token: "access",
        refresh_token: "refresh",
        client_id: "client",
        client_secret: "secret",
      },
      { baseUrl: "https://inbox.dog", autoRefresh: true }
    );
    expect(getEmail).toHaveBeenCalledWith("email-1");
    expect(result).toEqual({ id: "email-1" });
  });

  it("throws for disallowed methods", async () => {
    const { GmailBridge } = await import("./GmailBridge");

    await expect(
      GmailBridge.prototype.call.call(
        {
          ctx: {
            props: {
              sessionId: "user_1",
              access_token: "access",
              refresh_token: "refresh",
              client_id: "client",
              client_secret: "secret",
            },
          },
        },
        "deleteEverything",
        []
      )
    ).rejects.toThrow("Method not allowed: deleteEverything");
  });
});
