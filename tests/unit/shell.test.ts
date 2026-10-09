import { describe, expect, it } from "vitest";
import { isAdminPath, navFor, needsSignIn } from "@/lib/nav";
import { callerFrom, signInError, validSignIn } from "@/lib/signin";

describe("signing in", () => {
  it("lets through only what needs no session", () => {
    expect(needsSignIn("/", false)).toBe(true);
    expect(needsSignIn("/documents/abc", false)).toBe(true);
    expect(needsSignIn("/login", false)).toBe(false);
    expect(needsSignIn("/api/session", false)).toBe(false);
    expect(needsSignIn("/", true)).toBe(false);
  });

  it("checks the form before sending it", () => {
    expect(validSignIn({ tenant: "", email: "", pin: "" })).toBe("Enter your organisation and email.");
    expect(validSignIn({ tenant: "acme", email: "a@b.in", pin: "123" })).toBe("Enter your 6-digit PIN.");
    expect(validSignIn({ tenant: "acme", email: "a@b.in", pin: "123456" })).toBeNull();
  });

  it("says one thing whatever was wrong, and when a lock ends", () => {
    expect(signInError(401, null).kind).toBe("fail");
    expect(signInError(401, null).text).toBe(
      "Those sign-in details are not right. Check the organisation, email and PIN.",
    );
    const locked = signInError(429, 900, new Date("2026-10-08T06:30:00Z"), "Asia/Kolkata");
    expect(locked.kind).toBe("warn");
    expect(locked.text).toBe("Too many wrong PINs. Signing in is locked for 15 minutes; try again at 12:15.");
  });
});

describe("who is signed in", () => {
  it("is read from the API, and an older API without the endpoint shows a reviewer", () => {
    const admin = { kind: "session", name: "Priya Nair", email: "priya@medisynth.in", role: "admin", organisation: "medisynth" };
    expect(callerFrom(200, admin)).toEqual(admin);
    expect(callerFrom(404, null)).toEqual({ kind: "session", name: "", email: null, role: "reviewer", organisation: "" });
    // Before the endpoint, the path existed for sign-out only: GET answers 405.
    expect(callerFrom(405, null)?.role).toBe("reviewer");
    expect(callerFrom(401, null)).toBeNull();
  });
});

describe("navigation", () => {
  it("shows administration only to administrators", () => {
    const reviewer = navFor("reviewer").map((item) => item.href);
    const admin = navFor("admin").map((item) => item.href);
    expect(reviewer).toEqual(["/", "/documents", "/upload", "/search", "/chat", "/collections", "/evals"]);
    expect(admin).toEqual([...reviewer, "/questions", "/agents", "/audit", "/webhooks"]);
    expect(isAdminPath("/audit")).toBe(true);
    expect(isAdminPath("/documents/abc")).toBe(false);
  });
});
