import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/chat", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: vi.fn(() => new Promise(() => undefined)), ApiError: class extends Error {} }));

import { ChatThread } from "@/components/chat/ChatThread";
import { Shell, useViewing } from "@/components/Shell";

beforeEach(() => {
  // jsdom has no media queries; the shell asks for the system theme.
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
});

const caller = { kind: "session", name: "Kartik Anand", email: "k@example.in", role: "admin", organisation: "", platform_admin: true };

function Probe() {
  return <p>{useViewing() ? "viewing" : "own"}</p>;
}

const thread = <ChatThread turns={[]} onTurns={() => undefined} conversationId={null} onConversation={() => undefined} scope={{}} />;

describe("viewing someone's workspace (React review M3)", () => {
  it("is known to every screen inside the shell, and false outside it", () => {
    const { unmount } = render(
      <Shell caller={caller} viewing={{ id: "2f1c9a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c", name: "Asha's workspace" }}>
        <Probe />
      </Shell>,
    );
    expect(screen.getByText("viewing")).toBeInTheDocument();
    unmount();
    render(<Probe />);
    expect(screen.getByText("own")).toBeInTheDocument();
  });

  it("offers no asking, and says why", () => {
    render(
      <Shell caller={caller} viewing={{ id: "2f1c9a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c", name: "" }}>
        {thread}
      </Shell>,
    );
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(screen.getByText(/Asking is off while you view/)).toBeInTheDocument();
  });

  it("leaves asking alone in one's own workspace", () => {
    render(<Shell caller={caller}>{thread}</Shell>);
    expect(screen.queryByText(/Asking is off while you view/)).toBeNull();
  });
});
