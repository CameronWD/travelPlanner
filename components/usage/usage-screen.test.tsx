import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const { pathnameMock, pendingMock, client } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/trips"),
  pendingMock: vi.fn((): { href: string; pathname: string; startedAt: number } | null => null),
  client: {
    startUsage: vi.fn(),
    setUsageTrip: vi.fn(),
    recordUsageScreen: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));
vi.mock("@/components/navigation/navigation-pending", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/navigation/navigation-pending")>()),
  useNavigationPending: () => pendingMock(),
}));
vi.mock("@/lib/usage/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/usage/client")>()),
  ...client,
}));

import { UsageRecorder } from "./usage-recorder";
import { UsageTrip } from "./usage-trip";
import { resetUsageScreenForTests } from "./use-usage-screen";

const TRIP = { tripId: "it-usage-trip", startDate: "2026-12-01", endDate: "2026-12-10", zone: "Etc/UTC" };

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
  vi.clearAllMocks();
  resetUsageScreenForTests();
  pathnameMock.mockReturnValue("/trips");
  pendingMock.mockReturnValue(null);
  Object.defineProperty(navigator, "serviceWorker", { value: { controller: null }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the recorder renders nothing", () => {
  it("is an empty string on the server, for both components", () => {
    expect(renderToString(<UsageRecorder userId="u" />)).toBe("");
    expect(renderToString(<UsageTrip {...TRIP} />)).toBe("");
  });

  it("starts Usage for the Traveller", () => {
    const { container } = render(<UsageRecorder userId="u1" />);
    expect(container.innerHTML).toBe("");
    expect(client.startUsage).toHaveBeenCalledWith("u1");
  });

  it("publishes the Trip while mounted and clears it after", () => {
    const { unmount } = render(<UsageTrip {...TRIP} />);
    expect(client.setUsageTrip).toHaveBeenLastCalledWith(TRIP);
    unmount();
    expect(client.setUsageTrip).toHaveBeenLastCalledWith(null);
  });
});

describe("one record per arrival", () => {
  it("records /trips once across re-renders", async () => {
    const view = render(<UsageRecorder userId="u" />);
    await settle();
    view.rerender(<UsageRecorder userId="u" />);
    view.rerender(<UsageRecorder userId="u" />);
    view.rerender(<UsageRecorder userId="u" />);
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledTimes(1);
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "trips", trip: null, saved: false, dayOffset: null }));
  });

  it("records a trip screen from UsageTrip and not from UsageRecorder", async () => {
    pathnameMock.mockReturnValue("/trips/northvale-loop/plan");
    render(
      <>
        <UsageRecorder userId="u" />
        <UsageTrip {...TRIP} />
      </>,
    );
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledTimes(1);
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "plan", trip: TRIP }));
  });

  it("does not record an app screen from UsageTrip", async () => {
    pathnameMock.mockReturnValue("/trips");
    render(<UsageTrip {...TRIP} />);
    await settle();
    expect(client.recordUsageScreen).not.toHaveBeenCalled();
  });

  it("records a new screen when the path moves to another one", async () => {
    const view = render(<UsageRecorder userId="u" />);
    await settle();
    pathnameMock.mockReturnValue("/globe");
    view.rerender(<UsageRecorder userId="u" />);
    await settle();
    pathnameMock.mockReturnValue("/trips");
    view.rerender(<UsageRecorder userId="u" />);
    await settle();
    expect(client.recordUsageScreen.mock.calls.map((c) => c[0].screen)).toEqual(["trips", "globe", "trips"]);
  });

  it("records nothing for a path that is not a screen", async () => {
    pathnameMock.mockReturnValue("/privacy");
    render(<UsageRecorder userId="u" />);
    await settle();
    expect(client.recordUsageScreen).not.toHaveBeenCalled();
  });

  it("records no second day when the date in the path changes", async () => {
    pathnameMock.mockReturnValue("/trips/northvale-loop/day/2026-12-02");
    const view = render(<UsageTrip {...TRIP} />);
    await settle();
    pathnameMock.mockReturnValue("/trips/northvale-loop/day/2026-12-03");
    view.rerender(<UsageTrip {...TRIP} />);
    await settle();
    pathnameMock.mockReturnValue("/trips/northvale-loop/day/2026-12-04");
    view.rerender(<UsageTrip {...TRIP} />);
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledTimes(1);
  });

  it("records a day screen again after going elsewhere and back", async () => {
    pathnameMock.mockReturnValue("/trips/northvale-loop/day/2026-12-02");
    const view = render(<UsageTrip {...TRIP} />);
    await settle();
    pathnameMock.mockReturnValue("/trips/northvale-loop/budget");
    view.rerender(<UsageTrip {...TRIP} />);
    await settle();
    pathnameMock.mockReturnValue("/trips/northvale-loop/day/2026-12-02");
    view.rerender(<UsageTrip {...TRIP} />);
    await settle();
    expect(client.recordUsageScreen.mock.calls.map((c) => c[0].screen)).toEqual(["day", "money", "day"]);
  });

  it("records a second Trip's screen even on the same kind of page", async () => {
    pathnameMock.mockReturnValue("/trips/northvale-loop/plan");
    const view = render(<UsageTrip {...TRIP} />);
    await settle();
    pathnameMock.mockReturnValue("/trips/westby-trail/plan");
    view.rerender(<UsageTrip {...TRIP} tripId="it-usage-other" />);
    await settle();
    expect(client.recordUsageScreen.mock.calls.map((c) => c[0].trip?.tripId)).toEqual(["it-usage-trip", "it-usage-other"]);
  });

  it("gives a day record its offset from today in the Trip's zone", async () => {
    pathnameMock.mockReturnValue("/trips/northvale-loop/day/2026-12-03");
    render(<UsageTrip {...TRIP} />);
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "day", dayOffset: 2 }));
  });

  it("gives no offset to a day path with no date", async () => {
    pathnameMock.mockReturnValue("/trips/northvale-loop/day");
    render(<UsageTrip {...TRIP} />);
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "day", dayOffset: null }));
  });
});

describe("time to appear", () => {
  it("is the time since the navigation began, for a later screen", async () => {
    const view = render(<UsageRecorder userId="u" />);
    await settle();
    const startedAt = Date.now() - 400;
    pendingMock.mockReturnValue({ href: "/globe", pathname: "/globe", startedAt });
    view.rerender(<UsageRecorder userId="u" />);
    pendingMock.mockReturnValue(null);
    pathnameMock.mockReturnValue("/globe");
    view.rerender(<UsageRecorder userId="u" />);
    client.recordUsageScreen.mockClear();
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "globe", ms: expect.any(Number) }));
    const ms = client.recordUsageScreen.mock.calls[0][0].ms;
    expect(ms).toBeGreaterThanOrEqual(400);
    expect(ms).toBeLessThan(500);
  });

  it("is null when nothing started the navigation", async () => {
    const view = render(<UsageRecorder userId="u" />);
    await settle();
    client.recordUsageScreen.mockClear();
    pathnameMock.mockReturnValue("/globe");
    view.rerender(<UsageRecorder userId="u" />);
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "globe", ms: null }));
  });

  it("is null when the navigation that started was for another path", async () => {
    const view = render(<UsageRecorder userId="u" />);
    await settle();
    client.recordUsageScreen.mockClear();
    pendingMock.mockReturnValue({ href: "/account", pathname: "/account", startedAt: Date.now() - 100 });
    view.rerender(<UsageRecorder userId="u" />);
    pathnameMock.mockReturnValue("/globe");
    view.rerender(<UsageRecorder userId="u" />);
    await settle();
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "globe", ms: null }));
  });
});

describe("saved copy", () => {
  it("asks the worker for the first screen of a document and records its answer", async () => {
    const postMessage = vi.fn((_m: unknown, ports?: MessagePort[]) => ports?.[0].postMessage({ savedCopy: true }));
    Object.defineProperty(navigator, "serviceWorker", { value: { controller: { postMessage } }, configurable: true });
    render(<UsageRecorder userId="u" />);
    await settle();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(client.recordUsageScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "trips", saved: true }));
  });

  it("does not ask for a later screen", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", { value: { controller: { postMessage } }, configurable: true });
    const view = render(<UsageRecorder userId="u" />);
    await settle();
    postMessage.mockClear();
    pathnameMock.mockReturnValue("/globe");
    view.rerender(<UsageRecorder userId="u" />);
    await settle();
    expect(postMessage).not.toHaveBeenCalled();
    expect(client.recordUsageScreen).toHaveBeenLastCalledWith(expect.objectContaining({ screen: "globe", saved: false }));
  });
});

describe("it cannot break a page", () => {
  it("renders on when recording a screen throws", async () => {
    client.recordUsageScreen.mockImplementation(() => {
      throw new Error("boom");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const { container } = render(<UsageRecorder userId="u" />);
    await settle();
    process.off("unhandledRejection", unhandled);
    expect(container.innerHTML).toBe("");
    expect(unhandled).not.toHaveBeenCalled();
  });
});
