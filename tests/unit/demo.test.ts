import { describe, expect, it } from "vitest";
import { demoAccount } from "@/lib/demo";

describe("the public demo's account", () => {
  it("is offered only where the deployment names its PIN", () => {
    expect(demoAccount({})).toBeNull();
    expect(demoAccount({ DOCFORGE_DEMO_PIN: "  " })).toBeNull();
    expect(demoAccount({ DOCFORGE_DEMO_PIN: "246810" })).toEqual({ organisation: "demo", email: "demo@docforge.example", pin: "246810" });
    expect(demoAccount({ DOCFORGE_DEMO_PIN: "246810", DOCFORGE_DEMO_TENANT: "acme", DOCFORGE_DEMO_EMAIL: "try@acme.in" })).toEqual({
      organisation: "acme", email: "try@acme.in", pin: "246810",
    });
  });
});
