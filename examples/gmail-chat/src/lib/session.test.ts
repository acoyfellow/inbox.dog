import { describe, it, expect } from "vitest";
import { getCookie, setCookie, clearCookie, SESSION_COOKIE } from "./session";

describe("getCookie", () => {
  it("returns value when cookie present", () => {
    const r = new Request("https://x/", {
      headers: { Cookie: `${SESSION_COOKIE}=user%40example.com` },
    });
    expect(getCookie(r)).toBe("user%40example.com");
  });

  it("returns null when cookie missing", () => {
    const r = new Request("https://x/");
    expect(getCookie(r)).toBe(null);
  });
});

describe("setCookie / clearCookie", () => {
  it("setCookie returns header with encoded userId and Max-Age", () => {
    const header = setCookie("user@example.com");
    expect(header).toContain(`${SESSION_COOKIE}=`);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Max-Age=604800");
  });

  it("clearCookie returns header with Max-Age=0", () => {
    const header = clearCookie();
    expect(header).toContain("Max-Age=0");
  });
});
