import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCover } from "./trip-cover";

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
