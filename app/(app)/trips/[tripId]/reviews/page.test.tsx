import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReviewsPageModel } from "@/lib/review/reviews-page-loader";

const requireTripAccess = vi.hoisted(() => vi.fn(async () => ({ user: { id: "u1" }, membership: { role: "member" } })));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/trip-shell-reads", () => ({
  readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", stops: [{ id: "s1", sortOrder: 0, timezone: "Europe/Berlin", arriveDate: "2026-12-06", departDate: "2026-12-09" }] })),
}));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async () => "xmas" }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
const model = vi.hoisted(() => ({ current: null as ReviewsPageModel | null }));
const loadReviewsPage = vi.hoisted(() => vi.fn(async () => model.current));
vi.mock("@/lib/review/reviews-page-loader", () => ({ loadReviewsPage }));
vi.mock("@/components/trip/reviews/review-run-panel", () => ({
  ReviewRunPanel: (p: { state: { kind: string }; fallbackTimeZone: string }) => <div data-testid="run-panel" data-kind={p.state.kind} data-zone={p.fallbackTimeZone} />,
}));
vi.mock("@/components/trip/reviews/review-poller", () => ({
  ReviewPoller: (p: { active: boolean; runningId: string | null; latestRun: { id: string; status: string } | null }) => (
    <div data-testid="poller" data-active={String(p.active)} data-running={p.runningId ?? ""} data-latest={p.latestRun ? `${p.latestRun.id}:${p.latestRun.status}` : ""} />
  ),
}));
vi.mock("@/components/trip/reviews/finding-list", () => ({
  FindingList: (p: { actionable: boolean; groups: unknown[] }) => <div data-testid="finding-list" data-actionable={String(p.actionable)} data-groups={p.groups.length} />,
}));
vi.mock("@/components/trip/reviews/review-history", () => ({
  ReviewHistory: (p: { rows: unknown[] }) => <div data-testid="history" data-rows={p.rows.length} />,
}));

import ReviewsPage, { maxDuration, metadata } from "./page";

const base: ReviewsPageModel = {
  panel: { kind: "ready" },
  running: null,
  latestRun: { id: "r2", status: "DONE", error: null },
  shown: {
    id: "r2", heading: "Standard Review", byLine: "Run by Cam, Sun 18 Oct, 14:05", status: "DONE",
    summary: "Two closures to plan around.", failure: null, open: [{ severity: "warning", heading: "Warnings", cards: [] }], dealtWith: [],
    openCount: 2, actionable: true, isLatest: true,
  },
  history: [{ id: "r2", href: "/trips/xmas/reviews?review=r2" as never, kindLabel: "Standard Review", byName: "Cam", when: "Sun 18 Oct, 14:05", line: "x", status: "DONE", current: true }],
};

async function renderPage(review?: string) {
  render(await ReviewsPage({ params: Promise.resolve({ tripId: "t1" }), searchParams: Promise.resolve(review ? { review } : {}) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  model.current = base;
});

describe("the Reviews tab (R10)", () => {
  it("is titled Reviews and gives the start action room to run", () => {
    expect(metadata.title).toBe("Reviews");
    expect(maxDuration).toBeGreaterThanOrEqual(300);
  });

  it("guards access, then loads for this viewer in the Trip's zone", async () => {
    await renderPage();
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
    expect(loadReviewsPage).toHaveBeenCalledWith(expect.objectContaining({
      tripId: "t1", userId: "u1", base: "/trips/xmas", timeZone: "Europe/Berlin", reviewId: null,
    }));
    expect(screen.getByRole("heading", { level: 1, name: "Reviews" })).toBeInTheDocument();
  });

  it("shows the Review's heading, who ran it, its summary, open count and Findings", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 2, name: "Standard Review" })).toBeInTheDocument();
    expect(screen.getByText("Run by Cam, Sun 18 Oct, 14:05")).toBeInTheDocument();
    expect(screen.getByText("Two closures to plan around.")).toBeInTheDocument();
    expect(screen.getByText("2 open")).toBeInTheDocument();
    expect(screen.getByTestId("finding-list")).toHaveAttribute("data-actionable", "true");
    expect(screen.getByTestId("history")).toHaveAttribute("data-rows", "1");
    expect(screen.getByTestId("run-panel")).toHaveAttribute("data-kind", "ready");
    expect(screen.getByTestId("poller")).toHaveAttribute("data-active", "false");
    // The status region stays mounted even with nothing running, so its text
    // changing (not the element appearing/disappearing) is what gets
    // announced at both ends of a run (controller fix round 1, item 2).
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("passes ?review= through, and an older Review says it is not the latest", async () => {
    model.current = { ...base, shown: { ...base.shown!, isLatest: false, actionable: false } };
    await renderPage("r1");
    expect(loadReviewsPage).toHaveBeenCalledWith(expect.objectContaining({ reviewId: "r1" }));
    expect(screen.getByRole("link", { name: "See the latest Review" })).toHaveAttribute("href", "/trips/xmas/reviews");
  });

  it("a Review from another Trip is a 404", async () => {
    model.current = null;
    await expect(renderPage("rx")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("while running: the line for everyone and the poll is on", async () => {
    model.current = { ...base, running: { id: "r3", line: "Reviewing… (started by Cam)" }, latestRun: { id: "r3", status: "RUNNING", error: null } };
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Reviewing… (started by Cam)");
    expect(screen.getByTestId("poller")).toHaveAttribute("data-active", "true");
    // The poller watches the run, so it can toast if it ends FAILED (final wave I2).
    expect(screen.getByTestId("poller")).toHaveAttribute("data-running", "r3");
    expect(screen.getByTestId("poller")).toHaveAttribute("data-latest", "r3:RUNNING");
  });

  it("a Review that didn't finish says why, with no Findings list (final wave I2)", async () => {
    const failure = "This Review didn't finish. Claude was busy, so this Review stopped. Start it again in a few minutes. Nothing on the trip was changed.";
    model.current = { ...base, shown: { ...base.shown!, status: "FAILED", summary: null, failure, open: [], dealtWith: [], openCount: 0, actionable: false } };
    await renderPage();
    expect(screen.getByText(failure)).toBeInTheDocument();
    expect(screen.queryByTestId("finding-list")).toBeNull();
  });

  it("no Reviews yet: an empty state, worded for whether the viewer can run one", async () => {
    model.current = { panel: { kind: "hidden" }, running: null, latestRun: null, shown: null, history: [] };
    await renderPage();
    expect(screen.getByText("No Reviews yet")).toBeInTheDocument();
    expect(screen.getByText("When someone on this trip runs a Review, what Claude finds shows here.")).toBeInTheDocument();
    expect(screen.queryByTestId("history")).toBeNull();
  });
});
