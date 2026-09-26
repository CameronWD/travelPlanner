import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCover, TripCoverCard } from "./trip-cover";

describe("TripCover", () => {
  it("renders an img with the cover API src when hasCover is true", () => {
    render(
      <TripCover
        tripId="trip-123"
        name="My Adventure"
        hasCover={true}
        stops={[]}
      />,
    );
    // The foreground photo (not the decorative blurred backdrop) carries the
    // real alt text, so select it by that.
    const img = screen.getByAltText("My Adventure cover") as HTMLImageElement;
    expect(img.src).toContain("/api/trips/trip-123/cover");
  });

  it("crops the photo to fill (object-cover), positioned at the Trip's focal point", () => {
    render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} focalX={0.3} focalY={0.6} />,
    );
    const photo = screen.getByAltText("Trip cover") as HTMLImageElement;
    expect(photo.className).toContain("size-full");
    expect(photo.className).toContain("object-cover");
    expect(photo.style.objectPosition).toBe("30% 60%");
  });

  it("centres the crop when the Trip has no focal point", () => {
    render(<TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />);
    const photo = screen.getByAltText("Trip cover") as HTMLImageElement;
    expect(photo.style.objectPosition).toBe("50% 50%");
  });

  it("never draws a full-width blurred backdrop — one image by default", () => {
    const { container } = render(<TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  function loadAs(img: HTMLImageElement, w: number, h: number) {
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: w });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: h });
    fireEvent.load(img);
  }

  it('variant="tile": a landscape photo fills the tile, so no blurred copy is added after load', () => {
    const { container } = render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} variant="tile" />,
    );
    loadAs(screen.getByAltText("Trip cover") as HTMLImageElement, 1600, 900);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByAltText("Trip cover").className).toContain("object-cover");
  });

  it('variant="tile": a portrait photo is shown whole, a light blurred copy filling the tile edges', () => {
    const { container } = render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} variant="tile" />,
    );
    const photo = screen.getByAltText("Trip cover") as HTMLImageElement;
    loadAs(photo, 900, 1600);
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(2);
    const blur = container.querySelector("img[aria-hidden='true']") as HTMLImageElement;
    expect(blur).not.toBeNull();
    expect(blur.getAttribute("alt")).toBe("");
    expect(blur.className).toMatch(/\bblur-(sm|md)\b/);
    expect(blur.className).not.toContain("blur-xl");
    // One image, one request: the edge fill reuses the photo's URL.
    expect(blur.getAttribute("src")).toBe(photo.getAttribute("src"));
    expect(photo.className).toContain("object-contain");
  });

  it('variant="tile": a letterboxed portrait photo stays centred, whatever its focal point', () => {
    render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} variant="tile" focalX={0.2} focalY={0.9} />,
    );
    const photo = screen.getByAltText("Trip cover") as HTMLImageElement;
    expect(photo.style.objectPosition).toBe("20% 90%");
    loadAs(photo, 900, 1600);
    expect(photo.className).toContain("object-contain");
    expect(photo.style.objectPosition).toBe("50% 50%");
  });

  it("outside the tile, a portrait photo never gets the blurred copy", () => {
    const { container } = render(<TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />);
    loadAs(screen.getByAltText("Trip cover") as HTMLImageElement, 900, 1600);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("renders an svg with circle pins when hasCover is false and stops are provided", () => {
    const { container } = render(
      <TripCover
        tripId="trip-123"
        name="My Adventure"
        hasCover={false}
        stops={[
          { lat: 48.8566, lng: 2.3522 },
          { lat: 51.5074, lng: -0.1278 },
        ]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
  });

  it("renders the monogram when hasCover is false and no stops are provided", () => {
    const { container } = render(
      <TripCover
        tripId="trip-123"
        name="adventure"
        hasCover={false}
        stops={[]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("LA-044: monogram cover uses a flat hue-fill treatment, never a gradient", () => {
    render(<TripCover tripId="trip-lonely" name="Lonely" hasCover={false} stops={[]} />);
    const cover = screen.getByText("L").parentElement!;
    expect(cover.className).toMatch(/bg-hue-(coral|sun|teal|lilac)/);
    expect(cover.className).not.toContain("gradient");
    expect(cover.className).toContain("text-on-accent");
  });

  it('variant="name" renders the trip name (in the display font) instead of the initial', () => {
    render(
      <TripCover
        tripId="trip-lonely"
        name="Lonely Peaks"
        hasCover={false}
        stops={[]}
        variant="name"
      />,
    );
    expect(screen.queryByText("L")).not.toBeInTheDocument();
    const nameEl = screen.getByText("Lonely Peaks");
    expect(nameEl.className).toContain("font-display");
    expect(nameEl.className).toContain("text-3xl");
    expect(nameEl.className).toContain("font-extrabold");
  });

  it("versions the cover URL so a replaced photo busts the browser cache", () => {
    render(
      <TripCover
        tripId="t1"
        name="Trip"
        hasCover={true}
        coverVersion="trips/t1/abc-cover.webp"
        stops={[]}
      />,
    );
    // Select the foreground photo, not the decorative backdrop, so this keeps
    // guarding the photo's URL even if the two layers' src ever diverges.
    const img = screen.getByAltText("Trip cover") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(
      `/api/trips/t1/cover?v=${encodeURIComponent("trips/t1/abc-cover.webp")}`,
    );
  });

  it("keeps the bare cover URL when no version is provided", () => {
    render(<TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />);
    const img = screen.getByAltText("Trip cover") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/trips/t1/cover");
  });
});

describe("TripCoverCard", () => {
  // Trip Home wraps its cover in this frame so the cover reads as its own
  // surface (kit shape: 2px border, hard shadow) rather than a bare image —
  // trip-card.tsx (trips list) deliberately does NOT use this: there,
  // TripCover already sits inside that card's own top section, and wrapping
  // it again here would double the border/shadow.
  it("gives the cover the kit Card shape — 2px border, hard shadow", () => {
    const { container } = render(
      <TripCoverCard>
        <TripCover tripId="t1" name="Trip" hasCover={false} stops={[]} />
      </TripCoverCard>,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
  });

  it("renders its children", () => {
    render(
      <TripCoverCard>
        <TripCover tripId="t1" name="adventure" hasCover={false} stops={[]} />
      </TripCoverCard>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
