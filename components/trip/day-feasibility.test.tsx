import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { setHopMode, markFlagFine, unmarkFlagFine } = vi.hoisted(() => ({ setHopMode: vi.fn(), markFlagFine: vi.fn(), unmarkFlagFine: vi.fn() }));
vi.mock("@/server/actions/hop-modes", () => ({ setHopMode }));
vi.mock("@/server/actions/flag-dismissals", () => ({ markFlagFine, unmarkFlagFine }));

import type { DayHopEntry } from "@/lib/day-view-loader";
import { DayFeasibility } from "./day-feasibility";

const hop = (n: number, over: Partial<DayHopEntry> = {}): DayHopEntry => ({
  fromItemId: `i${n}`,
  toItemId: `i${n + 1}`,
  fromTitle: `Place ${n}`,
  toTitle: `Place ${n + 1}`,
  minutes: 12,
  travel: "walk",
  estimated: false,
  mode: "WALK",
  modeSetByHand: false,
  ...over,
});

// Stands in for the server round trip: the action rewrites the hop and the page re-renders.
function Harness({ initial, entries = [] }: { initial: DayHopEntry[]; entries?: React.ComponentProps<typeof DayFeasibility>["entries"] }) {
  const [hops, setHops] = React.useState(initial);
  setHopMode.mockImplementation(async (from: string, to: string, mode: DayHopEntry["mode"] | null) => {
    setHops((hs) => hs.map((h) => (h.fromItemId === from && h.toItemId === to ? { ...h, ...(mode ? { mode, modeSetByHand: true } : { modeSetByHand: false }) } : h)));
    return { success: true };
  });
  return <DayFeasibility tripId="t1" entries={entries} hops={hops} />;
}

describe("DayFeasibility", () => {
  it("renders one row per entry with the message", () => {
    render(
      <DayFeasibility
        tripId="t1"
        entries={[
          { severity: "warning", message: "Only 5 min but 27 min to walk." },
          { severity: "info", message: "Cutting it close: 20 min gap, ~12 min travel." },
        ]}
      />,
    );
    expect(screen.getByText("Only 5 min but 27 min to walk.")).toBeInTheDocument();
    expect(
      screen.getByText("Cutting it close: 20 min gap, ~12 min travel."),
    ).toBeInTheDocument();
  });

  it("renders nothing when entries is empty", () => {
    const { container } = render(<DayFeasibility tripId="t1" entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders as the kit sun 'heads up' card (DDays.jsx), not the old 1px card", () => {
    const { container } = render(
      <DayFeasibility tripId="t1" entries={[{ severity: "warning", message: "Only 5 min but 27 min to walk." }]} />,
    );
    const card = container.firstChild as HTMLElement;
    const cls = card.className.split(/\s+/);
    expect(cls).toContain("bg-sun");
    expect(cls).toContain("island");
    expect(cls).toContain("border-2");
    expect(cls).not.toContain("rounded-2xl");
    // A sun fill under sun-text would collapse — text on the island is plain ink.
    expect(container.innerHTML).not.toMatch(/text-sun-text/);
    expect(screen.getByRole("heading", { name: "Getting around" })).toBeInTheDocument();
  });

  it("offers a Hop mode chooser only on a row that carries a hop", () => {
    render(
      <DayFeasibility
        tripId="t1"
        entries={[
          { severity: "warning", message: "With a hop.", hop: { fromItemId: "a", toItemId: "b", mode: "WALK", modeSetByHand: true } },
          { severity: "info", message: "Without." },
        ]}
      />,
    );
    expect(screen.getAllByRole("button", { name: /How this hop is travelled/ })).toHaveLength(1);
  });

  describe("hops", () => {
    const three = [hop(1), hop(2, { travel: "transit", minutes: 25, mode: "TRANSIT" }), hop(3, { travel: "drive", minutes: 18, estimated: true, mode: "DRIVE" })];

    it("with three unflagged hops shows All hops (3) collapsed, and three rows with choosers when expanded", async () => {
      render(<Harness initial={three} />);
      const toggle = screen.getByRole("button", { name: /All hops \(3\)/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(/Place 1/)).not.toBeInTheDocument();
      expect(screen.queryAllByRole("button", { name: /How this hop is travelled/ })).toHaveLength(0);

      await userEvent.click(toggle);
      expect(screen.getByText(/Place 1 → Place 2/)).toHaveTextContent("12 min walk");
      expect(screen.getByText(/Place 2 → Place 3/)).toHaveTextContent("25 min by public transport");
      expect(screen.getByText(/Place 3 → Place 4/)).toHaveTextContent("18 min drive (estimated)");
      expect(screen.getAllByRole("button", { name: /How this hop is travelled/ })).toHaveLength(3);
    });

    it("setting Walk on an unflagged hop moves it out of the disclosure, marked as hand-set; Automatic puts it back", async () => {
      render(<Harness initial={three} />);
      await userEvent.click(screen.getByRole("button", { name: /All hops \(3\)/ }));
      await userEvent.click(screen.getAllByRole("button", { name: /How this hop is travelled: Automatic/ })[1]);
      await userEvent.click(screen.getByRole("menuitem", { name: "Walk" }));

      expect(await screen.findByRole("button", { name: /All hops \(2\)/ })).toBeInTheDocument();
      const handSet = screen.getByRole("button", { name: "How this hop is travelled: Walk" });
      expect(handSet.closest("div")).toHaveTextContent("Place 2 → Place 3");

      await userEvent.click(handSet);
      await userEvent.click(screen.getByRole("menuitem", { name: "Automatic" }));
      expect(await screen.findByRole("button", { name: /All hops \(3\)/ })).toBeInTheDocument();
      expect(setHopMode).toHaveBeenLastCalledWith("i2", "i3", null);
    });

    it("a hand-set hop is always shown, with no disclosure when it is the only one", () => {
      render(<DayFeasibility tripId="t1" entries={[]} hops={[hop(1, { modeSetByHand: true })]} />);
      expect(screen.getByText(/Place 1 → Place 2/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "How this hop is travelled: Walk" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /All hops/ })).not.toBeInTheDocument();
    });

    it("a flagged hop keeps its warning and chooser and is not repeated in the disclosure", async () => {
      const flagged = hop(1);
      render(
        <DayFeasibility
          tripId="t1"
          entries={[{ severity: "warning", message: "Tight between Place 1 and Place 2.", hop: { fromItemId: "i1", toItemId: "i2", mode: "WALK", modeSetByHand: false } }]}
          hops={[flagged, hop(2)]}
        />,
      );
      expect(screen.getByText("Tight between Place 1 and Place 2.")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /How this hop is travelled/ })).toHaveLength(1);
      await userEvent.click(screen.getByRole("button", { name: /All hops \(1\)/ }));
      const rows = screen.getAllByText(/→/);
      expect(rows).toHaveLength(1);
      expect(within(rows[0].closest("div")!).getByText(/Place 2 → Place 3/)).toBeInTheDocument();
    });

    it("renders just the heading and the collapsed disclosure when no hop is flagged or hand-set", () => {
      render(<DayFeasibility tripId="t1" entries={[]} hops={[hop(1)]} />);
      expect(screen.getByRole("heading", { name: "Getting around" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /All hops \(1\)/ })).toHaveAttribute("aria-expanded", "false");
    });
  });
});

describe("DayFeasibility: Marked fine (spec 2026-11-18 T5)", () => {
  const tightEntry = { flagId: "tight-i1-i2", severity: "warning" as const, message: "Tight between Place 1 and Place 2.", hop: { fromItemId: "i1", toItemId: "i2", mode: "WALK" as const, modeSetByHand: false } };
  const marked = { flagId: "tight-i1-i2", message: "Tight between Place 1 and Place 2.", markedByName: "Xanthia" };

  it('"This is fine" on a tight row calls the action', async () => {
    markFlagFine.mockResolvedValue({ success: true });
    render(<DayFeasibility tripId="t1" entries={[tightEntry]} hops={[hop(1)]} />);
    await userEvent.click(screen.getByRole("button", { name: "This is fine" }));
    expect(markFlagFine).toHaveBeenCalledWith("t1", "tight-i1-i2");
  });

  it('a Marked fine hop sits under "1 marked fine", not in the always-shown rows, and stays in All hops', async () => {
    unmarkFlagFine.mockResolvedValue({ success: true });
    render(<DayFeasibility tripId="t1" entries={[]} markedFine={[marked]} hops={[hop(1), hop(2)]} />);
    expect(screen.queryByText("Tight between Place 1 and Place 2.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is fine" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /How this hop is travelled/ })).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "1 marked fine" }));
    expect(screen.getByText("Tight between Place 1 and Place 2.")).toBeInTheDocument();
    expect(screen.getByText("Marked fine by Xanthia")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(unmarkFlagFine).toHaveBeenCalledWith("t1", "tight-i1-i2");

    await userEvent.click(screen.getByRole("button", { name: /All hops \(2\)/ }));
    expect(screen.getByText(/Place 1 → Place 2/)).toBeInTheDocument();
  });

  it('two read "2 marked fine", and the card shows with nothing else in it', () => {
    render(<DayFeasibility tripId="t1" entries={[]} markedFine={[marked, { ...marked, flagId: "tight-i2-i3" }]} />);
    expect(screen.getByRole("heading", { name: "Getting around" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 marked fine" })).toBeInTheDocument();
  });
});
