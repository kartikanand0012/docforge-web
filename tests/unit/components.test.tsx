import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Dialog, SecretDialog } from "@/components/Dialog";
import { PinInput } from "@/components/PinInput";
import { ToastProvider, useToast } from "@/components/Toast";
import { ConfidenceMeter, ReasonLine, StageProgress, StatusBadge } from "@/components/ui";

describe("status never by colour alone", () => {
  it("a badge always carries its word", () => {
    render(<StatusBadge kind="fail">Failed</StatusBadge>);
    expect(screen.getByText("Failed")).toHaveClass("badge", "badge-fail");
  });

  it("a reason line says its label and its text", () => {
    render(<ReasonLine kind="fail" label="Check failed" text="Total is ₹180.00 more than the lines" />);
    expect(screen.getByText("Check failed:")).toBeInTheDocument();
    expect(screen.getByText("Total is ₹180.00 more than the lines")).toBeInTheDocument();
  });

  it("stage progress says where it is in words", () => {
    render(<StageProgress stage="extracting" />);
    expect(screen.getByText("Extracting · step 3 of 6")).toBeInTheDocument();
  });

  it("confidence shows the figure, or that it was corrected", () => {
    const { rerender } = render(<ConfidenceMeter value={0.61} />);
    expect(screen.getByText("61%")).toBeInTheDocument();
    rerender(<ConfidenceMeter value={0.61} corrected />);
    expect(screen.getByText("Corrected")).toBeInTheDocument();
  });
});

describe("PIN entry", () => {
  function Pin() {
    const [pin, setPin] = useState("");
    return <PinInput value={pin} onChange={setPin} label="Signing as Priya. Enter your 6-digit PIN." />;
  }

  it("takes digits only, as a password, and shows a dot per digit", async () => {
    render(<Pin />);
    const input = screen.getByLabelText("Signing as Priya. Enter your 6-digit PIN.");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
    await userEvent.type(input, "4a8-2 9");
    expect(input).toHaveValue("4829");
    expect(screen.getAllByText("•")).toHaveLength(4);
  });
});

describe("dialogs", () => {
  it("close on Escape and give focus back to what opened them", async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Dialog title="Hello" onClose={() => setOpen(false)}>
              <button>Inside</button>
            </Dialog>
          )}
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByText("Open");
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Hello" })).toHaveAttribute("aria-modal", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("a one-time secret is shown with Copy focused, and Done closes it", async () => {
    const done = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<SecretDialog title="Your new key" secret="dfk_0123456789ab_secret" onDone={done} />);
    const copy = screen.getByRole("button", { name: "Copy" });
    expect(copy).toHaveFocus();
    await userEvent.click(copy);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done, I have copied it" }));
    expect(done).toHaveBeenCalled();
  });

  it("a confirmation is an alert dialog with its own action", async () => {
    const confirm = vi.fn();
    render(<ConfirmDialog title="Revoke this key?" body="Agents stop at once." action="Revoke" onConfirm={confirm} onClose={() => {}} />);
    expect(screen.getByRole("alertdialog", { name: "Revoke this key?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(confirm).toHaveBeenCalled();
  });
});

describe("toasts", () => {
  it("say what was done, politely, and go after six seconds", () => {
    vi.useFakeTimers();
    function Saver() {
      const toast = useToast();
      return <button onClick={() => toast("Correction saved.")}>Save</button>;
    }
    render(
      <ToastProvider>
        <Saver />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getByRole("status")).toHaveTextContent("Correction saved.");
    act(() => vi.advanceTimersByTime(6100));
    expect(screen.queryByText("Correction saved.")).toBeNull();
    vi.useRealTimers();
  });
});
