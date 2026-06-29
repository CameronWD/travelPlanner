import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCover } from "./trip-cover";

describe("TripCover", () => {
  it("renders an img with the cover API src when hasCover is true", () => {
    const { container } = render(
      <TripCover
        tripId="trip-123"
        name="My Adventure"
        hasCover={true}
        stops={[]}
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("/api/trips/trip-123/cover");
    expect(img!.alt).toContain("My Adventure");
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
});
