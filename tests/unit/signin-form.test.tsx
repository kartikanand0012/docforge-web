import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import SignUpPage from "@/app/signup/page";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))));
  return () => vi.unstubAllGlobals();
});

describe("a form's validation error points at its field (React review L8)", () => {
  it("sign-in marks the empty email, describes it with the error and moves focus to it", async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const email = screen.getByLabelText("Email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email.");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter your email.");
    expect(email).toHaveFocus();
  });

  it("sign-up does the same for a short password, keeping its hint", async () => {
    render(<SignUpPage />);
    await userEvent.type(screen.getByLabelText("Your name"), "Asha");
    await userEvent.type(screen.getByLabelText("Email"), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(/At least 10 characters.*Choose a password of at least 10 characters/);
    expect(password).toHaveFocus();
    expect(screen.getByLabelText("Your name")).not.toHaveAttribute("aria-invalid");
  });
});
