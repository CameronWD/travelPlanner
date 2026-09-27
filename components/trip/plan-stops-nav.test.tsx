import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanStopsNav, type PlanStopsNavStop } from "./plan-stops-nav";

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

const STOPS: PlanStopsNavStop[] = [
  { id: "s1", name: "Rome", colourHue: "sky", dateLabel: "10–13 Dec", chapterId: "italy" },
  { id: "s2", name: "Florence", colourHue: "sun", dateLabel: "13–15 Dec", chapterId: "italy" },
  { id: "s3", name: "Somewhere rough", colourHue: "leaf", dateLabel: "~3 nights", chapterId: null },
];

const CHAPTERS = [{ id: "italy", name: "Italy" }];

function renderNav(overrides: Partial<React.ComponentProps<typeof PlanStopsNav>> = {}) {
  return render(
    <PlanStopsNav
      stops={STOPS}
      chapters={CHAPTERS}
      homeBase={{ name: "Sydney", roundTrip: true }}
      {...overrides}
    />,
  );
}

describe("PlanStopsNav", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the Home base, grouped Chapter headings in order, and Stop rows with dates / rough nights", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Stops" });

    // Home base appears (origin row); round trip also shows a return row.
    expect(within(nav).getAllByText("Sydney")).toHaveLength(2);

    // Chapter heading, in order, above its Stops.
    expect(within(nav).getByText("Italy")).toBeInTheDocument();

    // Stop rows with their date labels.
    expect(within(nav).getByText("Rome")).toBeInTheDocument();
    expect(within(nav).getByText("10–13 Dec")).toBeInTheDocument();
    expect(within(nav).getByText("Florence")).toBeInTheDocument();
    expect(within(nav).getByText("13–15 Dec")).toBeInTheDocument();

    // Rough Stop shows "~N nights" instead of a date range.
    expect(within(nav).getByText("Somewhere rough")).toBeInTheDocument();
    expect(within(nav).getByText("~3 nights")).toBeInTheDocument();

    // Order: Italy heading appears before Rome/Florence, and after Home base.
    const text = nav.textContent ?? "";
    expect(text.indexOf("Italy")).toBeLessThan(text.indexOf("Rome"));
    expect(text.indexOf("Rome")).toBeLessThan(text.indexOf("Florence"));
  });

  it("renders a flat list with no headings when chapters is null", () => {
    renderNav({ chapters: null });
    const nav = screen.getByRole("navigation", { name: "Stops" });
    expect(within(nav).queryByText("Italy")).toBeNull();
  });

  it("clicking a Stop row scrolls its card into view and rings it", async () => {
    const user = userEvent.setup();
    const target = document.createElement("div");
    target.id = "stop-s2";
    document.body.appendChild(target);
    const scrollSpy = vi.spyOn(target, "scrollIntoView").mockImplementation(() => {});

    renderNav();
    await user.click(screen.getByText("Florence"));

    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    expect(target.getAttribute("data-highlight")).toBe("true");
  });

  it("clicking the Home base row scrolls to the bookend card", async () => {
    const user = userEvent.setup();
    const target = document.createElement("div");
    target.id = "home-base-top";
    document.body.appendChild(target);
    const scrollSpy = vi.spyOn(target, "scrollIntoView").mockImplementation(() => {});

    renderNav();
    const nav = screen.getByRole("navigation", { name: "Stops" });
    await user.click(within(nav).getAllByText("Sydney")[0]);

    expect(scrollSpy).toHaveBeenCalled();
  });

  it("marks the topmost intersecting Stop card active via scroll-spy", () => {
    const cardS3 = document.createElement("div");
    cardS3.setAttribute("data-stop-id", "s3");
    document.body.appendChild(cardS3);

    let capturedCallback: IntersectionObserverCallback | null = null;
    class FakeIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        capturedCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    renderNav();
    expect(capturedCallback).not.toBeNull();

    act(() => {
      capturedCallback!(
        [
          {
            isIntersecting: true,
            boundingClientRect: { top: 10 } as DOMRectReadOnly,
            target: cardS3,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    const nav = screen.getByRole("navigation", { name: "Stops" });
    const roughRow = within(nav).getByText("Somewhere rough").closest("button");
    expect(roughRow).toHaveAttribute("aria-current", "location");

    vi.unstubAllGlobals();
    document.body.removeChild(cardS3);
  });

  it("scrolls to and rings a Stop named by the URL hash on mount", () => {
    const target = document.createElement("div");
    target.id = "stop-s1";
    document.body.appendChild(target);
    const scrollSpy = vi.spyOn(target, "scrollIntoView").mockImplementation(() => {});

    window.history.replaceState(null, "", "#stop-s1");
    renderNav();

    expect(scrollSpy).toHaveBeenCalled();
    expect(target.getAttribute("data-highlight")).toBe("true");

    window.history.replaceState(null, "", "/");
  });

  it("renders nothing when there are no Stops and no Home base", () => {
    const { container } = renderNav({ stops: [], chapters: null, homeBase: null });
    expect(container).toBeEmptyDOMElement();
  });
});
