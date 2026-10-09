import { describe, expect, it } from "vitest";
import config from "../../next.config";

describe("browser hardening (security review M1)", () => {
  it("every page refuses to be framed, is not content-sniffed and has a content security policy", async () => {
    const rules = await config.headers!();
    const all = rules.find((rule) => rule.source === "/:path*");
    const headers = Object.fromEntries((all?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["content-security-policy"]).toContain("base-uri 'self'");
  });
});
