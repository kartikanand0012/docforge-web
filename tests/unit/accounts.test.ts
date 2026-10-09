import { describe, expect, it } from "vitest";
import { usd } from "@/lib/format";
import { isAdminPath, navFor, needsSignIn } from "@/lib/nav";
import { isWorkspaceId } from "@/lib/server";

describe("navigation by role", () => {
  const hrefs = (role: string, platform = false) => navFor(role, platform).map((item) => item.href);

  it("gives an account the main screens only", () => {
    expect(hrefs("member")).not.toContain("/webhooks");
    expect(hrefs("member")).not.toContain("/audit");
    expect(hrefs("member")).not.toContain("/admin");
    expect(hrefs("member")).toContain("/upload");
  });

  it("gives the platform administrator the dashboard, and nobody else", () => {
    expect(hrefs("admin")).not.toContain("/admin");
    expect(hrefs("admin", true)).toContain("/admin");
    expect(isAdminPath("/admin")).toBe(true);
  });

  it("leaves the landing page, sign-up and sign-in open, and nothing else", () => {
    for (const open of ["/welcome", "/signup", "/login"]) expect(needsSignIn(open, false)).toBe(false);
    for (const closed of ["/", "/admin", "/documents", "/signupx/../admin"]) expect(needsSignIn(closed, false)).toBe(true);
  });
});

describe("the workspace being viewed", () => {
  it("is only ever a well-formed id, so nothing else reaches the API's header", () => {
    expect(isWorkspaceId("c0a6a797-56f6-4a83-b07d-4af205599ff5")).toBe(true);
    expect(isWorkspaceId("c0a6a797-56f6-4a83-b07d-4af205599ff5\r\nX-Other: 1")).toBe(false);
    expect(isWorkspaceId("")).toBe(false);
    expect(isWorkspaceId(undefined)).toBe(false);
  });
});

describe("a model cost", () => {
  it("keeps four decimals below a cent, two above", () => {
    expect(usd(0.00042)).toBe("$0.0004");
    expect(usd(1.5)).toBe("$1.50");
    expect(usd(0)).toBe("$0.00");
    expect(usd(null)).toBe("—");
  });
});
