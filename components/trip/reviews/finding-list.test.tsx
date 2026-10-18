import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a>,
}));
const actions = vi.hoisted(() => ({ applyFinding: vi.fn(), undoFinding: vi.fn(), dismissFinding: vi.fn() }));
vi.mock("@/server/actions/reviews", () => actions);
let capturedOnUndo: (() => void) | null = null;
vi.mock("@/components/ui/undo-toast", () => ({
  toastWithUndo: (o: { onUndo: () => void }) => { capturedOnUndo = o.onUndo; return "t1"; },
}));
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toastMock(...a) }));

import type { Route } from "next";
import { FindingList } from "./finding-list";
import type { FindingCard, FindingGroup } from "@/lib/review/view";

/**
 * R's real FindingCard carries its own canApply/canDismiss/canUndo (R's
 * FindingView flags, lib/review-reads.ts): on the latest DONE Review an OPEN
 * Finding with a fix can Apply and always can Dismiss; Undo of an Apply can
 * be offered on any Review, but Undo of a Dismiss only on the latest.
 * FindingList follows these as given — see its docblock.
 */
const card = (o: Partial<FindingCard> = {}): FindingCard => ({
  id: "f1", severity: "warning", categoryLabel: "Booking", title: "Night train not booked", detail: "Sells out in December.",
  source: { href: "https://example.com/nj", host: "example.com" }, state: "OPEN", stateLabel: "Open",
  fix: { kind: "row", label: "Mark as to book" }, goTo: { href: "/trips/xmas/plan" as Route, label: "Open in the plan" }, stateAtMs: null,
  canApply: true, canDismiss: true, canUndo: false, ...o,
});
const groups = (...cards: FindingCard[]): FindingGroup[] => [
  { severity: "warning", heading: "Warnings", cards: cards.filter((c) => c.severity === "warning") },
  { severity: "info", heading: "Notes", cards: cards.filter((c) => c.severity === "info") },
].filter((g) => g.cards.length > 0) as FindingGroup[];
const row = (title: string) => screen.getByText(title).closest("li")!;

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnUndo = null;
});

describe("FindingList (R8, R10)", () => {
  it("groups by severity and shows each Finding's detail, fix, source and state", () => {
    render(<FindingList actionable groups={groups(card(), card({ id: "f2", severity: "info", title: "Pack layers", fix: null, canApply: false, source: null }))} />);
    expect(screen.getByRole("heading", { name: "Warnings (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes (1)" })).toBeInTheDocument();
    const r = within(row("Night train not booked"));
    expect(r.getByText("Sells out in December.")).toBeInTheDocument();
    expect(r.getByText("Suggested fix: Mark as to book")).toBeInTheDocument();
    expect(r.getByRole("link", { name: "Source: example.com" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(r.getByText("Open")).toBeInTheDocument();
    expect(r.getByRole("link", { name: "Night train not booked" })).toHaveAttribute("href", "/trips/xmas/plan");
  });

  it("Apply runs the fix, shows Applied, and the toast's Undo reverses it", async () => {
    actions.applyFinding.mockResolvedValue({ success: true });
    actions.undoFinding.mockResolvedValue({ success: true });
    render(<FindingList actionable groups={groups(card())} />);
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Apply: Night train not booked" }));
    expect(actions.applyFinding).toHaveBeenCalledWith("f1");
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Applied")).toBeInTheDocument());
    capturedOnUndo!();
    await waitFor(() => expect(actions.undoFinding).toHaveBeenCalledWith("f1"));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument());
  });

  it("a refused Apply puts it back to Open and says why", async () => {
    actions.applyFinding.mockResolvedValue({ success: false, errors: { _: ["That thing to do no longer exists."] } });
    render(<FindingList actionable groups={groups(card())} />);
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Apply: Night train not booked" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "That thing to do no longer exists." })));
    expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument();
  });

  it("no fix means Dismiss only; Dismiss marks it Dismissed", async () => {
    actions.dismissFinding.mockResolvedValue({ success: true });
    render(<FindingList actionable groups={groups(card({ fix: null, canApply: false }))} />);
    const r = within(row("Night train not booked"));
    expect(r.queryByRole("button", { name: "Apply: Night train not booked" })).toBeNull();
    await userEvent.click(r.getByRole("button", { name: "Dismiss: Night train not booked" }));
    expect(actions.dismissFinding).toHaveBeenCalledWith("f1");
    await waitFor(() => expect(r.getByText("Dismissed")).toBeInTheDocument());
  });

  it("an Applied Finding keeps an Undo button after the toast, and says 'Fix undone'", async () => {
    actions.undoFinding.mockResolvedValue({ success: true });
    render(<FindingList actionable groups={groups(card({ state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))} />);
    const r = within(row("Night train not booked"));
    expect(r.getByText("Applied by Cam, 18 Oct")).toBeInTheDocument();
    expect(r.queryByText("Suggested fix: Mark as to book")).toBeNull();
    await userEvent.click(r.getByRole("button", { name: "Undo: Night train not booked" }));
    expect(actions.undoFinding).toHaveBeenCalledWith("f1");
    await waitFor(() => expect(r.getByText("Open")).toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Fix undone" }));
  });

  it("a failed persistent Undo leaves it Applied", async () => {
    actions.undoFinding.mockResolvedValue({ success: false, errors: {} });
    render(<FindingList actionable groups={groups(card({ state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))} />);
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Undo: Night train not booked" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(within(row("Night train not booked")).getByText("Applied by Cam, 18 Oct")).toBeInTheDocument();
  });

  it("Dismiss offers Undo too, when canUndo is true, and says 'Dismiss undone'", async () => {
    actions.undoFinding.mockResolvedValue({ success: true });
    render(<FindingList actionable groups={groups(card({ state: "DISMISSED", stateLabel: "Dismissed by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))} />);
    const r = within(row("Night train not booked"));
    expect(r.getByText("Dismissed by Cam, 18 Oct")).toBeInTheDocument();
    await userEvent.click(r.getByRole("button", { name: "Undo: Night train not booked" }));
    expect(actions.undoFinding).toHaveBeenCalledWith("f1");
    await waitFor(() => expect(r.getByText("Open")).toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Dismiss undone" }));
  });

  it("a refused toast Undo after a persistent Undo already succeeded does not resurrect a stale Applied badge (controller fix round 1, item 1)", async () => {
    actions.applyFinding.mockResolvedValue({ success: true });
    actions.undoFinding
      .mockResolvedValueOnce({ success: true }) // the persistent Undo button, clicked first
      .mockResolvedValueOnce({ success: false, errors: {} }); // the stale toast Undo, fired after
    const { rerender } = render(<FindingList actionable groups={groups(card())} />);

    // Apply, to capture the toast's own (later stale) Undo.
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Apply: Night train not booked" }));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Applied")).toBeInTheDocument());
    const staleToastUndo = capturedOnUndo!;

    // The page refreshes: the server now shows it Applied, with its own persistent Undo.
    rerender(<FindingList actionable groups={groups(card({ state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))} />);
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Undo: Night train not booked" }));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument());

    // The page refreshes again: the server now genuinely shows it Open.
    rerender(<FindingList actionable groups={groups(card({ state: "OPEN" }))} />);

    // The original toast's Undo, stale by now, finally fires and is refused
    // (there is nothing left to undo) — the badge must still read Open, not
    // revert to a guessed "Applied".
    staleToastUndo();
    await waitFor(() => expect(actions.undoFinding).toHaveBeenCalledTimes(2));
    expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument();
  });

  it("an older Review is read-only: no Apply, Dismiss or Undo", () => {
    render(
      <FindingList
        actionable={false}
        groups={groups(
          card({ canApply: false, canDismiss: false, canUndo: false }),
          card({ id: "f2", title: "Gone one", state: "GONE", stateLabel: "No longer found", canApply: false, canDismiss: false, canUndo: false }),
        )}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("No longer found")).toBeInTheDocument();
  });

  it("an empty Review says so", () => {
    render(<FindingList actionable groups={[]} />);
    expect(screen.getByText("Nothing to flag. This Review found no problems.")).toBeInTheDocument();
  });
});
