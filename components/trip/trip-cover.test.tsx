import { render, screen } from "@testing-library/react";
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

  it("never crops the cover photo, and fills the dead space with a blurred copy", () => {
    const { container } = render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />,
    );
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(2);

    const [backdrop, photo] = imgs;

    // The backdrop is decorative: it carries no alt text and is hidden from
    // assistive tech, because it is the same picture as the foreground.
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    expect(backdrop.getAttribute("alt")).toBe("");
    expect(backdrop.className).toContain("object-cover");
    expect(backdrop.className).toContain("blur-xl");

    // The photo itself is never cropped.
    expect(photo.className).toContain("object-contain");
    expect(photo.getAttribute("alt")).toContain("Trip");

    // One image, one request: the backdrop reuses the foreground's URL.
    expect(backdrop.getAttribute("src")).toBe(photo.getAttribute("src"));
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

  it("LA-028: cover backdrop fills the card instead of leaving a gap", () => {
    const { container } = render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />,
    );
    const backdrop = container.querySelector("img[aria-hidden='true']")!;
    expect(backdrop.className).toContain("size-[calc(100%+4rem)]");
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
