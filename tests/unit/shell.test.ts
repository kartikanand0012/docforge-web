import { describe, expect, it } from "vitest";
import { isAdminPath, navFor, needsSignIn } from "@/lib/nav";
import { callerFrom, checkSignIn, checkSignUp, signInError, signUpError, validSignIn, validSignUp } from "@/lib/signin";

describe("signing in", () => {
  it("lets through only what needs no session", () => {
    expect(needsSignIn("/", false)).toBe(true);
    expect(needsSignIn("/documents/abc", false)).toBe(true);
    expect(needsSignIn("/login", false)).toBe(false);
    expect(needsSignIn("/api/session", false)).toBe(false);
    expect(needsSignIn("/", true)).toBe(false);
  });

  it("checks the form before sending it", () => {
    expect(validSignIn({ tenant: "", email: "", pin: "" })).toBe("Enter your email.");
    expect(validSignIn({ tenant: "", email: "a@b.in", pin: "short" })).toBe("Enter your password.");
    expect(validSignIn({ tenant: "", email: "a@b.in", pin: "a long password" })).toBeNull();
    expect(validSignIn({ tenant: "acme", email: "a@b.in", pin: "123" })).toBe("Enter your 6-digit PIN.");
    expect(validSignIn({ tenant: "acme", email: "a@b.in", pin: "123456" })).toBeNull();
    // The message names the field it is about, for the page to point at.
    expect(checkSignIn({ tenant: "", email: " ", pin: "" })?.field).toBe("email");
    expect(checkSignIn({ tenant: "acme", email: "a@b.in", pin: "1" })?.field).toBe("pin");
  });

  it("says one thing whatever was wrong, and when a lock ends", () => {
    expect(signInError(401, null).kind).toBe("fail");
    expect(signInError(401, null).text).toBe(
      "Those sign-in details are not right. Check your email and password (or organisation and PIN).",
    );
    const locked = signInError(429, 900, new Date("2026-10-08T06:30:00Z"), "Asia/Kolkata");
    expect(locked.kind).toBe("warn");
    expect(locked.text).toBe("Too many wrong attempts. Signing in is locked for 15 minutes; try again at 12:15.");
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

  it("is shown as a reviewer when the answer is not a caller (no role or name, or not strings)", () => {
    const unknown = { kind: "session", name: "", email: null, role: "reviewer", organisation: "" };
    expect(callerFrom(200, {})).toEqual(unknown);
    expect(callerFrom(200, { name: "Priya", role: 1 })).toEqual(unknown);
    expect(callerFrom(200, { name: { first: "Priya" }, role: "admin" })).toEqual(unknown);
    expect(callerFrom(200, "admin")).toEqual(unknown);
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

describe("creating an account", () => {
  it("asks for a name, a real-looking email and a long enough password", () => {
    expect(validSignUp({ name: " ", email: "a@b.in", password: "x".repeat(10) })).toBe("Enter your name.");
    expect(validSignUp({ name: "Asha", email: "not-an-email", password: "x".repeat(10) })).toBe("Enter a valid email address.");
    expect(validSignUp({ name: "Asha", email: "asha@example.in", password: "short" })).toBe("Choose a password of at least 10 characters.");
    expect(validSignUp({ name: "Asha", email: "asha@example.in", password: "x".repeat(10) })).toBeNull();
    expect(checkSignUp({ name: "", email: "", password: "" })?.field).toBe("name");
    expect(checkSignUp({ name: "Asha", email: "nope", password: "" })?.field).toBe("email");
    expect(checkSignUp({ name: "Asha", email: "asha@example.in", password: "x".repeat(129) })?.field).toBe("password");
  });

  it("says what went wrong in words", () => {
    expect(signUpError(409, null, null)).toBe("An account with this email already exists. Sign in instead.");
    expect(signUpError(429, null, 600)).toBe("Too many accounts were created from here just now. Try again in 10 minutes.");
    expect(signUpError(404, null, null)).toBe("New accounts are not open on this deployment.");
  });
});
