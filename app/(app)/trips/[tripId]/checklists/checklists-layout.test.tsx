import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ChecklistsLayout,
  CHECKLISTS_TAB_CLASS,
  CHECKLISTS_TABS_LIST_CLASS,
} from "./checklists-layout";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

const panels = [
  { value: "pretrip" as const, label: "Pre-trip", content: <div>Pre-trip content</div> },
  { value: "packing" as const, label: "Packing", content: <div>Packing content</div> },
  { value: "booking" as const, label: "Booking parser", content: <div>Booking content</div> },
];

describe("ChecklistsLayout (LA-017)", () => {
  it("shows tabs on phones and a card grid on desktop", () => {
    mockMatchMedia(false);
    const { rerender } = render(<ChecklistsLayout panels={panels} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();

    mockMatchMedia(true);
    rerender(<ChecklistsLayout panels={panels} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("renders every panel's content in the desktop grid", () => {
    mockMatchMedia(true);
    render(<ChecklistsLayout panels={panels} />);
    expect(screen.getByText("Pre-trip content")).toBeInTheDocument();
    expect(screen.getByText("Packing content")).toBeInTheDocument();
    expect(screen.getByText("Booking content")).toBeInTheDocument();
  });
});

describe("Checklists tab classes (LA-052)", () => {
  it("segmented tabs are 44px tall on touch and the third label fits at 360", () => {
    expect(CHECKLISTS_TAB_CLASS).toContain("pointer-coarse:h-11");
    expect(CHECKLISTS_TAB_CLASS).toContain("max-sm:px-2");
    expect(CHECKLISTS_TAB_CLASS).not.toContain("max-sm:px-2.5");
  });

  // LA-052 residual: at exactly 360px the tab strip's rounded right border
  // still clipped the last "r" of "Booking parser" with only ~5px of
  // clearance — one more padding step below the general max-sm cut buys
  // that back.
  it("takes one more padding step below 375px so 'Booking parser' clears the border (LA-052)", () => {
    expect(CHECKLISTS_TAB_CLASS).toContain("max-[375px]:px-1.5");
    // The two ranges must abut (not overlap another max-width rule at the
    // same breakpoint) or Tailwind's generated stylesheet order — not the
    // breakpoint size — decides which one silently wins.
    expect(CHECKLISTS_TAB_CLASS).toContain("min-[375px]:max-sm:px-2");
  });

  it("tab list grows enough to hold the 44px hit area without clipping", () => {
    expect(CHECKLISTS_TABS_LIST_CLASS).toContain("pointer-coarse:h-[3.25rem]");
    expect(CHECKLISTS_TABS_LIST_CLASS).not.toMatch(/overflow-(visible|hidden)/);
  });

  it("tabs are the kit teal Segmented", () => {
    expect(CHECKLISTS_TAB_CLASS).toContain("data-[state=active]:bg-teal");
    expect(CHECKLISTS_TAB_CLASS).toContain("data-[state=active]:text-on-accent");
    expect(CHECKLISTS_TAB_CLASS).toContain("shrink-0");
  });
});
