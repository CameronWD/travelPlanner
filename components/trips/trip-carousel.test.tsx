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

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("TripCarousel", () => {
  it("hides arrows and dots when every card fits", () => {
    mount(600, 1000);
    expect(screen.queryByRole("button", { name: "Next trips" })).toBeNull();
    expect(document.querySelector("[data-carousel-dots]")).toBeNull();
  });
  it("shows arrows and one dot per page when it overflows", () => {
    mount(1236, 1000);
    expect(screen.getByRole("button", { name: "Previous trips" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next trips" })).toBeEnabled();
    expect(document.querySelectorAll("[data-carousel-dot]")).toHaveLength(2);
  });
  it("steps to the next/previous card's own offsetLeft, not a fixed width+gap (I4)", () => {
    const { track } = mount(1236, 1000);
    track.scrollTo = vi.fn();
    const [first, second] = screen.getAllByTestId("card");
    Object.defineProperty(first, "offsetLeft", { configurable: true, value: 0 });
    Object.defineProperty(second, "offsetLeft", { configurable: true, value: 618 });
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 618, behavior: "smooth" });
    Object.defineProperty(track, "scrollLeft", { configurable: true, value: 618 });
    act(() => { fireEvent.scroll(track); });
    fireEvent.click(screen.getByRole("button", { name: "Previous trips" }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });
  it("arrow keys scroll the focused track to the next/previous card (I4)", () => {
    const { track } = mount(1236, 1000);
    track.scrollTo = vi.fn();
    const [first, second] = screen.getAllByTestId("card");
    Object.defineProperty(first, "offsetLeft", { configurable: true, value: 0 });
    Object.defineProperty(second, "offsetLeft", { configurable: true, value: 618 });
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 618, behavior: "smooth" });
    Object.defineProperty(track, "scrollLeft", { configurable: true, value: 618 });
    act(() => { fireEvent.scroll(track); });
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });
  it("reduced motion scrolls without smooth behaviour", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { track } = mount(1236, 1000);
    track.scrollTo = vi.fn();
    const [first, second] = screen.getAllByTestId("card");
    Object.defineProperty(first, "offsetLeft", { configurable: true, value: 0 });
    Object.defineProperty(second, "offsetLeft", { configurable: true, value: 618 });
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 618, behavior: "auto" });
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
