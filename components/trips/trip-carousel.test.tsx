import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TripCarousel, CarouselArrows, CarouselTrack, CarouselDots } from "./trip-carousel";

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
  it("scrolls by one card plus the gap", () => {
    const { track } = mount(1236, 1000);
    const card = screen.getAllByTestId("card")[0];
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 318, behavior: "smooth" });
  });
  it("arrow keys scroll the focused track", () => {
    const { track } = mount(1236, 1000);
    const card = screen.getAllByTestId("card")[0];
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 300 });
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 318, behavior: "smooth" });
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(track.scrollBy).toHaveBeenCalledWith({ left: -318, behavior: "smooth" });
  });
});
