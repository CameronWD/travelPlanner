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
let capturedToast: { title: React.ReactNode } | null = null;
vi.mock("@/components/ui/undo-toast", () => ({
  toastWithUndo: (o: { onUndo: () => void; title: React.ReactNode }) => { capturedOnUndo = o.onUndo; capturedToast = o; return "t1"; },
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
 * FindingList follows these as given — see its docblock. The default card's
 * fix is a "row" fix with a go-to that reads "Open the day" (spec 2026-10-18
 * A1's own example), so most tests exercise the ordinary path and the
 * Packing/Pre-trip/no-fix cards only override what differs.
 */
const card = (o: Partial<FindingCard> = {}): FindingCard => ({
  id: "f1", severity: "warning", categoryLabel: "Booking", title: "Night train not booked", detail: "Sells out in December.",
  source: { href: "https://example.com/nj", host: "example.com" }, state: "OPEN", stateLabel: "Open",
  fix: { kind: "row", label: "Mark as to book" }, goTo: { href: "/trips/xmas/day/2026-12-08" as Route, label: "Open the day" }, stateAtMs: null,
  canApply: true, canDismiss: true, canUndo: false, ...o,
});
/** Builds the `open` prop: the real loader's partitionFindings groups Open cards by severity (lib/review/view.ts). */
const openGroups = (...cards: FindingCard[]): FindingGroup[] => [
  { severity: "warning", heading: "Warnings", cards: cards.filter((c) => c.severity === "warning") },
  { severity: "info", heading: "Notes", cards: cards.filter((c) => c.severity === "info") },
].filter((g) => g.cards.length > 0) as FindingGroup[];
const row = (title: string) => screen.getByText(title).closest("li")!;

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnUndo = null;
  capturedToast = null;
});

describe("FindingList (R8, R10, spec 2026-10-18 A1, A2, A5)", () => {
  it("groups Open Findings by severity under 'To deal with', and shows each Finding's detail, fix, source, state and go-to", () => {
    render(
      <FindingList
        actionable
        open={openGroups(card(), card({ id: "f2", severity: "info", title: "Pack layers", fix: null, goTo: null, canApply: false, source: null }))}
        dealtWith={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "To deal with (2)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Warnings (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes (1)" })).toBeInTheDocument();
    const r = within(row("Night train not booked"));
    expect(r.getByText("Sells out in December.")).toBeInTheDocument();
    expect(r.getByText("Suggested fix: Mark as to book")).toBeInTheDocument();
    expect(r.getByRole("link", { name: "Source: example.com" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(r.getByText("Open")).toBeInTheDocument();
    expect(r.getByRole("link", { name: "Open the day" })).toHaveAttribute("href", "/trips/xmas/day/2026-12-08");
  });

  it("Apply runs a row fix, shows Applied ('Fix applied'), and the toast's Undo reverses it", async () => {
    actions.applyFinding.mockResolvedValue({ success: true });
    actions.undoFinding.mockResolvedValue({ success: true });
    render(<FindingList actionable open={openGroups(card())} dealtWith={[]} />);
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Apply: Night train not booked" }));
    expect(actions.applyFinding).toHaveBeenCalledWith("f1", undefined);
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Applied")).toBeInTheDocument());
    expect(capturedToast?.title).toBe("Fix applied");
    capturedOnUndo!();
    await waitFor(() => expect(actions.undoFinding).toHaveBeenCalledWith("f1"));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument());
  });

  it("a refused Apply puts it back to Open and says why", async () => {
    actions.applyFinding.mockResolvedValue({ success: false, errors: { _: ["That thing to do no longer exists."] } });
    render(<FindingList actionable open={openGroups(card())} dealtWith={[]} />);
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Apply: Night train not booked" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "That thing to do no longer exists." })));
    expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument();
  });

  it("no fix means Dismiss only; Dismiss marks it Dismissed", async () => {
    actions.dismissFinding.mockResolvedValue({ success: true });
    render(<FindingList actionable open={openGroups(card({ fix: null, canApply: false }))} dealtWith={[]} />);
    const r = within(row("Night train not booked"));
    expect(r.queryByRole("button", { name: "Apply: Night train not booked" })).toBeNull();
    await userEvent.click(r.getByRole("button", { name: "Dismiss: Night train not booked" }));
    expect(actions.dismissFinding).toHaveBeenCalledWith("f1");
    await waitFor(() => expect(r.getByText("Dismissed")).toBeInTheDocument());
  });

  it("a whole-Trip Finding with no fix and nowhere to go shows Dismiss only", () => {
    render(<FindingList actionable open={openGroups(card({ fix: null, goTo: null, source: null, canApply: false }))} dealtWith={[]} />);
    const r = within(row("Night train not booked"));
    expect(r.queryByRole("button", { name: /Apply|Need to pack|Need to buy|Add to pre-trip checklist/ })).toBeNull();
    expect(r.queryByRole("link")).toBeNull();
    expect(r.getByRole("button", { name: "Dismiss: Night train not booked" })).toBeInTheDocument();
  });

  it("an Open PACKING card shows Need to pack and Need to buy, not Apply; Need to buy applies with choice BUY", async () => {
    actions.applyFinding.mockResolvedValue({ success: true });
    render(
      <FindingList
        actionable
        open={openGroups(card({ fix: { kind: "packing", label: "Add to the packing list: Umbrella" } }))}
        dealtWith={[]}
      />,
    );
    const r = within(row("Night train not booked"));
    expect(r.queryByRole("button", { name: "Apply: Night train not booked" })).toBeNull();
    expect(r.getByRole("button", { name: "Need to pack: Night train not booked" })).toBeInTheDocument();
    await userEvent.click(r.getByRole("button", { name: "Need to buy: Night train not booked" }));
    expect(actions.applyFinding).toHaveBeenCalledWith("f1", "BUY");
    await waitFor(() => expect(r.getByText("Applied")).toBeInTheDocument());
    expect(capturedToast?.title).toBe("Added");
  });

  it("an Open PRETRIP card shows one Add to pre-trip checklist button", async () => {
    actions.applyFinding.mockResolvedValue({ success: true });
    render(
      <FindingList
        actionable
        open={openGroups(card({ fix: { kind: "pretrip", label: "Add to the pre-trip checklist: Buy rail pass" } }))}
        dealtWith={[]}
      />,
    );
    const r = within(row("Night train not booked"));
    expect(r.queryByRole("button", { name: "Apply: Night train not booked" })).toBeNull();
    await userEvent.click(r.getByRole("button", { name: "Add to pre-trip checklist: Night train not booked" }));
    expect(actions.applyFinding).toHaveBeenCalledWith("f1", undefined);
    await waitFor(() => expect(r.getByText("Applied")).toBeInTheDocument());
  });

  it("a checklist Apply already on the list surfaces the server's own toast title", async () => {
    actions.applyFinding.mockResolvedValue({ success: true, already: "Already on your packing list." });
    render(
      <FindingList
        actionable
        open={openGroups(card({ fix: { kind: "packing", label: "Add to the packing list: Umbrella" } }))}
        dealtWith={[]}
      />,
    );
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Need to pack: Night train not booked" }));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Applied")).toBeInTheDocument());
    expect(capturedToast?.title).toBe("Already on your packing list.");
  });

  it("an Applied Finding keeps an Undo button after the toast, and says 'Fix undone'", async () => {
    actions.undoFinding.mockResolvedValue({ success: true });
    render(
      <FindingList
        actionable
        open={openGroups(card({ state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))}
        dealtWith={[]}
      />,
    );
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
    render(
      <FindingList
        actionable
        open={openGroups(card({ state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))}
        dealtWith={[]}
      />,
    );
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Undo: Night train not booked" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(within(row("Night train not booked")).getByText("Applied by Cam, 18 Oct")).toBeInTheDocument();
  });

  it("Dismiss offers Undo too, when canUndo is true, and says 'Dismiss undone'", async () => {
    actions.undoFinding.mockResolvedValue({ success: true });
    render(
      <FindingList
        actionable
        open={openGroups(card({ state: "DISMISSED", stateLabel: "Dismissed by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))}
        dealtWith={[]}
      />,
    );
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
    const { rerender } = render(<FindingList actionable open={openGroups(card())} dealtWith={[]} />);

    // Apply, to capture the toast's own (later stale) Undo.
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Apply: Night train not booked" }));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Applied")).toBeInTheDocument());
    const staleToastUndo = capturedOnUndo!;

    // The page refreshes: the server now shows it Applied, with its own persistent Undo.
    rerender(
      <FindingList
        actionable
        open={openGroups(card({ state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true }))}
        dealtWith={[]}
      />,
    );
    await userEvent.click(within(row("Night train not booked")).getByRole("button", { name: "Undo: Night train not booked" }));
    await waitFor(() => expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument());

    // The page refreshes again: the server now genuinely shows it Open.
    rerender(<FindingList actionable open={openGroups(card({ state: "OPEN" }))} dealtWith={[]} />);

    // The original toast's Undo, stale by now, finally fires and is refused
    // (there is nothing left to undo) — the badge must still read Open, not
    // revert to a guessed "Applied".
    staleToastUndo();
    await waitFor(() => expect(actions.undoFinding).toHaveBeenCalledTimes(2));
    expect(within(row("Night train not booked")).getByText("Open")).toBeInTheDocument();
  });

  it("actionable=false hides Apply, Need to pack/buy, Add to pre-trip and Dismiss, but keeps the go-to link", () => {
    render(
      <FindingList
        actionable={false}
        open={openGroups(
          card({ canApply: false, canDismiss: false, canUndo: false }),
          card({ id: "f2", title: "Gone one", state: "GONE", stateLabel: "No longer found", goTo: null, canApply: false, canDismiss: false, canUndo: false }),
        )}
        dealtWith={[]}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Open the day" })).toBeInTheDocument();
    expect(screen.getByText("No longer found")).toBeInTheDocument();
  });

  it("dealtWith renders inside a closed 'Dealt with' details; a FIXED card shows its badge and no Undo", () => {
    const fixed = card({ id: "f3", title: "Fixed one", state: "FIXED", stateLabel: "Fixed in the plan", fix: null, canApply: false, canDismiss: false, canUndo: false });
    const applied = card({ id: "f4", title: "Applied one", state: "APPLIED", stateLabel: "Applied by Cam, 18 Oct", fix: null, canApply: false, canDismiss: false, canUndo: true });
    render(<FindingList actionable open={[]} dealtWith={[fixed, applied]} />);
    const details = screen.getByText("Dealt with (2)").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    const fixedRow = within(row("Fixed one"));
    expect(fixedRow.getByText("Fixed in the plan")).toBeInTheDocument();
    expect(fixedRow.queryByRole("button", { name: "Undo: Fixed one" })).toBeNull();
    const appliedRow = within(row("Applied one"));
    expect(appliedRow.getByRole("button", { name: "Undo: Applied one" })).toBeInTheDocument();
  });

  it("no Open Findings but some dealt with says 'All dealt with.'", () => {
    render(
      <FindingList
        actionable
        open={[]}
        dealtWith={[card({ state: "DISMISSED", stateLabel: "Dismissed by Cam, 18 Oct", canApply: false, canDismiss: false, canUndo: true })]}
      />,
    );
    expect(screen.getByText("All dealt with.")).toBeInTheDocument();
    expect(screen.getByText("Dealt with (1)")).toBeInTheDocument();
  });

  it("no Findings at all says so", () => {
    render(<FindingList actionable open={[]} dealtWith={[]} />);
    expect(screen.getByText("Nothing to flag. This Review found no problems.")).toBeInTheDocument();
  });
});
