import { describe, it, expect, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";

// MOTION.md: reduced motion → instant or an 80ms fade. MotionConfig's
// reducedMotion="user" skips transforms only, so the JS fades and heights
// read useReducedMotion themselves (useMotionTiming).
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));

import { useMotionTiming, REDUCED_EXIT, REDUCED_FADE } from "./use-motion-timing";
import { StopRow } from "./stop-row";
import { IdeasBox } from "./ideas-box";
import { DaySection } from "./day-section";

// Every full-motion exit here is ≥180ms; these waits give up well before that.
const FAST = { timeout: 120 };

const PARIS = {
  id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-14",
  nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null,
};
const ITEMS = [{ id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];

describe("reduced motion (MOTION.md)", () => {
  it("useMotionTiming swaps any spec for an 80ms fade, and exits for instant", () => {
    const { result } = renderHook(() => useMotionTiming());
    expect(result.current.reduced).toBe(true);
    expect(result.current.t({ duration: 0.32 })).toBe(REDUCED_FADE);
    expect(REDUCED_FADE).toEqual({ duration: 0.08 });
    expect(result.current.t({ duration: 0.2 }, "exit")).toBe(REDUCED_EXIT);
  });

  it("P3: folding a day removes its rows at once", async () => {
    const day = (collapsed: boolean) => (
      <DaySection
        tripId="t1" stopId="par" dateISO="2026-12-11" items={ITEMS} ideasCount={0} collapsed={collapsed}
        onCollapsedChange={vi.fn()} showDragHint={false} onAdd={vi.fn()} onEditItem={vi.fn()} onPickIdea={vi.fn()}
      />
    );
    const { container, rerender } = render(day(false));
    rerender(day(true));
    await waitFor(() => expect(container.querySelector("[data-motion='day-fold']")).toBeNull(), FAST);
  });

  it("P2: folding removes the body at once", async () => {
    const stop = { ...PARIS, id: "r", name: "Rome" };
    const row = (open: boolean) => (
      <StopRow stop={stop} number={1} open={open} onToggle={vi.fn()} bodyId="body-r" stay={null} plansCount={0} ideasCount={0} menuGroups={[]}>
        <p>open body</p>
      </StopRow>
    );
    const { container, rerender } = render(row(true));
    rerender(row(false));
    await waitFor(() => expect(container.querySelector("#body-r")).toBeNull(), FAST);
  });

  it("P7: a scheduled idea's chip goes at once", async () => {
    const idea = (id: string, title: string) => ({ id, title, category: "SIGHTSEEING" });
    const ideas = [idea("i1", "Orsay"), idea("i2", "Sainte-Chapelle")];
    const { rerender } = render(<IdeasBox ideas={ideas} onOpen={vi.fn()} onAdd={vi.fn()} />);
    rerender(<IdeasBox ideas={[ideas[1]]} onOpen={vi.fn()} onAdd={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('[data-idea="i1"]')).toBeNull(), FAST);
    expect(screen.getByText("1 IDEA")).toBeInTheDocument();
  });
});
