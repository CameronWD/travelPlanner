import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { flowProps, flowMounts, userFind, memberCount, reconcile, sharedRouteNameMock } = vi.hoisted(() => ({
  sharedRouteNameMock: vi.fn(),
  flowProps: vi.fn(),
  flowMounts: vi.fn(),
  userFind: vi.fn(),
  memberCount: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: reconcile }));
// The page resolves only the name; createTrip re-derives the stops server-side.
vi.mock("@/server/actions/copy-route-from-share", () => ({
  sharedRouteName: sharedRouteNameMock,
  routeStopsFromShare: () => {
    throw new Error("the page must not load the shared stops");
  },
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: userFind }, tripMember: { count: memberCount } } }));
vi.mock("@/components/new-trip/new-trip-flow", async () => {
  const React = await import("react");
  return {
    NewTripFlow: (p: Record<string, unknown>) => {
      flowProps(p);
      React.useEffect(() => {
        flowMounts();
      }, []);
      return <div data-testid="flow" />;
    },
  };
});

import NewTripPage, { generateMetadata } from "./page";

const page = async (sp: Record<string, string> = {}) => render(await NewTripPage({ searchParams: Promise.resolve(sp) }));

describe("/trips/new", () => {
  beforeEach(() => {
    flowProps.mockReset();
    flowMounts.mockReset();
    userFind.mockReset().mockResolvedValue({ displayName: "Cameron Williams", email: "cam@example.com" });
    reconcile.mockReset().mockResolvedValue(undefined);
    memberCount.mockReset().mockResolvedValue(0);
    sharedRouteNameMock.mockReset().mockResolvedValue(null);
  });

  it("a first trip passes the first word of the display name (spec C7)", async () => {
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ past: false, firstTrip: true, displayName: "Cameron" }));
  });
  it("no display name → null, so the eyebrow reads Let's start your first trip.", async () => {
    userFind.mockResolvedValue({ displayName: null });
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ displayName: null }));
  });
  it("reconciles pending Invites before counting trips, so an invited Traveller is not on their first", async () => {
    let finish!: () => void;
    reconcile.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const pending = NewTripPage({ searchParams: Promise.resolve({}) });
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledWith("u1", "cam@example.com"));
    expect(memberCount).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(memberCount).toHaveBeenCalledTimes(1);
  });
  it("a Traveller with trips is not on their first", async () => {
    memberCount.mockResolvedValue(3);
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ firstTrip: false }));
  });
  // ADR 0067 (Recently deleted): a Trip in Recently deleted must not count
  // toward "first trip" — the count query itself excludes it.
  it("excludes a Trip in Recently deleted from the first-trip count", async () => {
    await page();
    expect(memberCount).toHaveBeenCalledWith({ where: { userId: "u1", trip: { deletedAt: null } } });
  });
  it("reads ?past, ?name and ?step", async () => {
    await page({ past: "1", name: "Bali", step: "2" });
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ past: true, initialName: "Bali", initialStep: 2 }));
    expect(sharedRouteNameMock).not.toHaveBeenCalled();
  });
  it("pre-fills '{name} (my version)' and threads the token when ?fromShare= resolves", async () => {
    sharedRouteNameMock.mockResolvedValue("Christmas in Europe");
    await page({ fromShare: "tok" });
    expect(sharedRouteNameMock).toHaveBeenCalledWith("tok");
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ initialName: "Christmas in Europe (my version)", fromShareToken: "tok" }));
  });
  it("ignores a ?fromShare= that no longer resolves — no pre-fill, no token", async () => {
    await page({ fromShare: "gone" });
    const props = flowProps.mock.calls[0][0];
    expect(props.initialName).toBeUndefined();
    expect(props.fromShareToken).toBeUndefined();
  });
  it("ignores ?fromShare= when logging a past trip — no lookup, no pre-fill, no token", async () => {
    sharedRouteNameMock.mockResolvedValue("Christmas in Europe");
    await page({ past: "1", fromShare: "tok" });
    expect(sharedRouteNameMock).not.toHaveBeenCalled();
    const props = flowProps.mock.calls[0][0];
    expect(props.initialName).toBeUndefined();
    expect(props.fromShareToken).toBeUndefined();
  });
  it("ignores a junk step", async () => {
    await page({ step: "abc" });
    expect(flowProps.mock.calls[0][0].initialStep).toBeUndefined();
  });
  it("Log a past trip (same route, ?past=1&name=) remounts the flow so it adopts the name", async () => {
    const { rerender } = await page({ name: "Bali" });
    rerender(await NewTripPage({ searchParams: Promise.resolve({ name: "Bali" }) }));
    expect(flowMounts).toHaveBeenCalledTimes(1);
    rerender(await NewTripPage({ searchParams: Promise.resolve({ past: "1", name: "Bali" }) }));
    expect(flowMounts).toHaveBeenCalledTimes(2);
    rerender(await NewTripPage({ searchParams: Promise.resolve({ past: "1", name: "Lisbon" }) }));
    expect(flowMounts).toHaveBeenCalledTimes(3);
  });
  it("titles the page", async () => {
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).toEqual({ title: "New trip" });
    expect(await generateMetadata({ searchParams: Promise.resolve({ past: "1" }) })).toEqual({ title: "Log a past trip" });
  });
});
