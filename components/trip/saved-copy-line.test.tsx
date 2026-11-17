import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const props = { tripRef: "munich", startDate: "2026-12-08", endDate: "2026-12-14", renderedToday: "2026-12-10", zone: "Europe/Berlin" };

async function load() {
  vi.resetModules();
  return (await import("./saved-copy-line")).SavedCopyLine;
}

function stubWorker(answer: boolean | null) {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const controller =
    answer === null
      ? null
      : {
          postMessage: vi.fn((_msg: unknown, ports: MessagePort[]) => {
            ports[0].postMessage({ savedCopy: answer });
          }),
        };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller,
      addEventListener: (_: string, cb: (e: { data: unknown }) => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    },
  });
  return { controller, push: (data: unknown) => listeners.forEach((l) => l({ data })) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SavedCopyLine", () => {
  it("renders nothing on the server even when the page is stale", async () => {
    vi.setSystemTime(new Date("2026-12-12T06:00:00Z"));
    stubWorker(null);
    const SavedCopyLine = await load();
    expect(renderToString(<SavedCopyLine {...props} />)).toBe("");
  });

  it("shows nothing on a fresh page on a good connection", async () => {
    vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
    const worker = stubWorker(false);
    const SavedCopyLine = await load();
    const { container } = render(<SavedCopyLine {...props} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(worker.controller!.postMessage).toHaveBeenCalledWith({ type: "WAS_SAVED_COPY", url: "/" }, expect.any(Array));
    expect(container).toBeEmptyDOMElement();
  });

  it("after mount, a page from an earlier day says so and links to the Day view for today", async () => {
    vi.setSystemTime(new Date("2026-12-12T06:00:00Z"));
    stubWorker(null);
    const SavedCopyLine = await load();
    render(<SavedCopyLine {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved Thu 10 Dec. Open today");
    expect(screen.getByRole("link", { name: "Open today" })).toHaveAttribute("href", "/trips/munich/day/2026-12-12");
  });

  it("links to the Trip's Home once today is past the Trip", async () => {
    vi.setSystemTime(new Date("2026-12-20T06:00:00Z"));
    stubWorker(null);
    const SavedCopyLine = await load();
    render(<SavedCopyLine {...props} />);
    expect(screen.getByRole("link", { name: "Open today" })).toHaveAttribute("href", "/trips/munich");
  });

  it("a saved copy from the same day says to reload, with no link", async () => {
    vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
    stubWorker(true);
    const SavedCopyLine = await load();
    render(<SavedCopyLine {...props} />);
    expect(await screen.findByText("Saved copy. Reload when you're back online")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("honours the worker's pushed message", async () => {
    vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
    const worker = stubWorker(null);
    const SavedCopyLine = await load();
    const { container } = render(<SavedCopyLine {...props} />);
    expect(container).toBeEmptyDOMElement();
    act(() => worker.push({ type: "SAVED_COPY", url: "https://teepee.example/trips/munich" }));
    expect(screen.getByText("Saved copy. Reload when you're back online")).toBeInTheDocument();
  });

  it("a page left open overnight becomes stale when the tab is shown again", async () => {
    vi.setSystemTime(new Date("2026-12-10T20:00:00Z"));
    stubWorker(null);
    const SavedCopyLine = await load();
    const { container } = render(<SavedCopyLine {...props} />);
    expect(container).toBeEmptyDOMElement();
    vi.setSystemTime(new Date("2026-12-11T07:00:00Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByRole("link", { name: "Open today" })).toHaveAttribute("href", "/trips/munich/day/2026-12-11");
  });

  it("a fresh page for today shows nothing after Open today lands", async () => {
    vi.setSystemTime(new Date("2026-12-12T06:00:00Z"));
    stubWorker(false);
    const SavedCopyLine = await load();
    const { container } = render(<SavedCopyLine {...props} renderedToday="2026-12-12" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("a device clock behind the server shows nothing", async () => {
    vi.setSystemTime(new Date("2026-12-08T06:00:00Z"));
    stubWorker(false);
    const SavedCopyLine = await load();
    const { container } = render(<SavedCopyLine {...props} />);
    expect(container).toBeEmptyDOMElement();
  });
});
