import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markFlagFine, unmarkFlagFine, toastRefused } = vi.hoisted(() => ({
  markFlagFine: vi.fn(),
  unmarkFlagFine: vi.fn(),
  toastRefused: vi.fn(),
}));
vi.mock("@/server/actions/flag-dismissals", () => ({ markFlagFine, unmarkFlagFine }));
vi.mock("@/components/ui/action-failure", () => ({ toastRefused, toastRejected: vi.fn() }));

import { MarkFineButton, MarkedFineList } from "./marked-fine";

beforeEach(() => {
  vi.clearAllMocks();
  markFlagFine.mockResolvedValue({ success: true });
  unmarkFlagFine.mockResolvedValue({ success: true });
});

describe("MarkFineButton", () => {
  const target = { flagId: "tight-a-b", fingerprint: "fp-1", between: { from: "Louvre", to: "Lunch" } };

  it('"This is fine" marks the Flag fine with the fingerprint it was shown with, named for its two things', async () => {
    render(<MarkFineButton tripId="t1" target={target} />);
    const button = screen.getByRole("button", { name: "This is fine: Louvre to Lunch" });
    expect(button).toHaveTextContent(/^This is fine$/);
    await userEvent.click(button);
    expect(markFlagFine).toHaveBeenCalledWith("t1", "tight-a-b", "fp-1");
    expect(toastRefused).not.toHaveBeenCalled();
  });

  it("says why when the action refuses", async () => {
    const refusal = { success: false, errors: { _: ["That warning has changed. Have another look."] } };
    markFlagFine.mockResolvedValue(refusal);
    render(<MarkFineButton tripId="t1" target={target} />);
    await userEvent.click(screen.getByRole("button", { name: /^This is fine/ }));
    expect(toastRefused).toHaveBeenCalledWith(refusal, expect.any(String));
  });
});

describe("answering while the change runs", () => {
  it("This is fine is disabled and busy until the action settles, and a second click does nothing", async () => {
    let resolve!: (v: unknown) => void;
    markFlagFine.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<MarkFineButton tripId="t1" target={{ flagId: "f", fingerprint: "fp", between: { from: "A", to: "B" } }} />);
    const button = screen.getByRole("button", { name: /^This is fine/ });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(markFlagFine).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true }));
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("Undo is disabled and busy until the action settles, and a second click does nothing", async () => {
    let resolve!: (v: unknown) => void;
    unmarkFlagFine.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<MarkedFineList tripId="t1" entries={[{ flagId: "f1", message: "Tight.", markedByName: "Xanthia" }]} />);
    await userEvent.click(screen.getByRole("button", { name: "1 marked fine" }));
    const undo = screen.getByRole("button", { name: "Undo" });
    await userEvent.click(undo);
    expect(undo).toBeDisabled();
    expect(undo).toHaveAttribute("aria-busy", "true");
    await userEvent.click(undo);
    expect(unmarkFlagFine).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true }));
  });
});

describe("MarkedFineList", () => {
  const entry = (n: number, markedByName = "Xanthia") => ({ flagId: `tight-a${n}-b${n}`, message: `Cutting it close ${n}.`, markedByName });

  it("renders nothing with none", () => {
    const { container } = render(<MarkedFineList tripId="t1" entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('collapses to "1 marked fine", and expands to who marked it and "Undo"', async () => {
    render(<MarkedFineList tripId="t1" entries={[entry(1)]} />);
    const toggle = screen.getByRole("button", { name: "1 marked fine" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Marked fine by Xanthia")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Cutting it close 1.")).toBeInTheDocument();
    expect(screen.getByText("Marked fine by Xanthia")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(unmarkFlagFine).toHaveBeenCalledWith("t1", "tight-a1-b1");
  });

  it('counts "2 marked fine"', () => {
    render(<MarkedFineList tripId="t1" entries={[entry(1), entry(2, "Sam")]} />);
    expect(screen.getByRole("button", { name: "2 marked fine" })).toBeInTheDocument();
  });
});
