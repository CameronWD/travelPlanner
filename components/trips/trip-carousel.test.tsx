import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TripCarousel, CarouselArrows, CarouselTrack, CarouselDots, CAROUSEL_TRACK_HEIGHT_CLASS } from "./trip-carousel";

function mount(scrollWidth: number, clientWidth: number) {
  const ui = render(
    <TripCarousel>
      <CarouselArrows />
      <CarouselTrack>
        <div data-testid="card" style={{ width: 300 }} />
        <div data-testid="card" style={{ width: 300 }} />
        <div data-testid="card" style={{ width: 300 }} />
      </CarouselTrack>
      <CarouselDots />
    </TripCarousel>,
  );
  const track = screen.getByRole("region", { name: "Your trips" }) as HTMLDivElement;
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(track, "clientWidth", { configurable: true, value: clientWidth });
  track.scrollBy = vi.fn();
  act(() => { fireEvent.scroll(track); });
  return { ...ui, track };
}

function placeCardsInPage(track: HTMLElement) {
  Object.defineProperty(track, "offsetLeft", { configurable: true, value: 160 });
  screen.getAllByTestId("card").forEach((card, i) => {
    Object.defineProperty(card, "offsetLeft", { configurable: true, value: 160 + i * 618 });
  });
}

function scrollTrackTo(track: HTMLElement, left: number) {
  Object.defineProperty(track, "scrollLeft", { configurable: true, value: left });
  act(() => { fireEvent.scroll(track); });
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("TripCarousel", () => {
  it("hides arrows and dots when every card fits", () => {
    mount(600, 1000);
    expect(screen.queryByRole("button", { name: "Next trips" })).toBeNull();
    expect(document.querySelector("[data-carousel-dots]")).not.toBeNull();
    expect(document.querySelector("[data-carousel-dot]")).toBeNull();
  });
  it("keeps the arrows' place when every card fits: present, invisible, inert and not announced", () => {
    mount(600, 1000);
    const group = document.querySelector("[data-carousel-arrows]") as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.className).toContain("invisible");
    expect(group.getAttribute("aria-hidden")).toBe("true");
    expect(group.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(group.querySelectorAll("button")).toHaveLength(2);
  });
  it("shows the arrows in the same place once the row overflows", () => {
    mount(600, 1000);
    const before = document.querySelector("[data-carousel-arrows]") as HTMLElement;
    const parent = before.parentElement;
    const index = Array.from(parent!.children).indexOf(before);
    act(() => { Object.defineProperty(screen.getByRole("region", { name: "Your trips" }), "scrollWidth", { configurable: true, value: 1236 }); fireEvent.scroll(screen.getByRole("region", { name: "Your trips" })); });
    const after = document.querySelector("[data-carousel-arrows]") as HTMLElement;
    expect(after).toBe(before);
    expect(after.parentElement).toBe(parent);
    expect(Array.from(parent!.children).indexOf(after)).toBe(index);
    expect(after.className).not.toContain("invisible");
    expect(after.hasAttribute("inert")).toBe(false);
    expect(after.getAttribute("aria-hidden")).toBeNull();
  });
  it("shows arrows and one dot per page when it overflows", () => {
    mount(1236, 1000);
    expect(screen.getByRole("button", { name: "Previous trips" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next trips" })).toBeEnabled();
    expect(document.querySelectorAll("[data-carousel-dot]")).toHaveLength(2);
  });
  it("steps one card at a time when the track sits inside a padded page (offsets are page-relative)", () => {
    const { track } = mount(2236, 1000);
    track.scrollTo = vi.fn();
    placeCardsInPage(track);
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 618, behavior: "smooth" });
    scrollTrackTo(track, 618);
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1236, behavior: "smooth" });
    scrollTrackTo(track, 1236);
    fireEvent.click(screen.getByRole("button", { name: "Previous trips" }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 618, behavior: "smooth" });
  });
  it("arrow keys step one card at a time", () => {
    const { track } = mount(2236, 1000);
    track.scrollTo = vi.fn();
    placeCardsInPage(track);
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 618, behavior: "smooth" });
    scrollTrackTo(track, 618);
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });
  it("reduced motion scrolls without smooth behaviour", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { track } = mount(2236, 1000);
    track.scrollTo = vi.fn();
    placeCardsInPage(track);
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 618, behavior: "auto" });
  });
  it("a disabled arrow stays visible but muted, not border-soft", () => {
    mount(2236, 1000);
    const prev = screen.getByRole("button", { name: "Previous trips" });
    expect(prev).toBeDisabled();
    expect(prev.className).not.toContain("disabled:text-border-soft");
    expect(prev.className).toContain("disabled:text-muted-foreground");
  });
});

describe("CarouselTrack height (Feedback cmumcg1u9000004l0rjio27w6)", () => {
  it("clips vertical overflow and is 6px taller than the cards so the shadow fits", () => {
    render(
      <TripCarousel>
        <CarouselTrack className={CAROUSEL_TRACK_HEIGHT_CLASS}>
          <div className="h-[250px] w-[220px] shrink-0 snap-start md:h-[280px]" />
        </CarouselTrack>
      </TripCarousel>,
    );
    const track = screen.getByRole("region", { name: "Your trips" });
    const c = track.className.split(/\s+/);
    expect(c).toContain("overflow-y-hidden");
    expect(c).toContain("pb-1.5");
    expect(c).toContain("h-[256px]");
    expect(c).toContain("md:h-[286px]");
    expect(c).not.toContain("h-[250px]");
  });
});
