import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCover, CoverArt } from "./trip-cover";

vi.mock("./cover-add-photo", () => ({ CoverAddPhoto: () => <div data-testid="add-photo" /> }));
vi.mock("next/image", () => ({
  default: ({ src, alt, className, ...rest }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={String(alt)}
      src={String(src)}
      className={typeof className === "string" ? className : undefined}
      data-testid={rest["data-testid"] as string | undefined}
    />
  ),
}));

const base = {
  tripId: "t1",
  name: "Christmas in Europe 2026",
  hue: "coral" as const,
  photo: null,
  startDate: "2026-12-04",
  canEdit: true,
};
const europe = [
  { id: "l", name: "London", lat: 51.5, lng: -0.12, nights: 5 },
  { id: "p", name: "Paris", lat: 48.85, lng: 2.35, nights: 4 },
  { id: "r", name: "Rome", lat: 41.9, lng: 12.5, nights: 6 },
];

describe("TripCover", () => {
  it("photo wins", () => {
    render(<TripCover {...base} photo={{ url: "/api/trips/t1/cover?v=k", focalX: null, focalY: null }} stops={europe} size="hero" />);
    expect(screen.getByRole("img", { name: "Christmas in Europe 2026 cover photo" })).toBeInTheDocument();
    expect(screen.queryByText("London → Rome")).toBeNull();
  });
  it("route sketch with ≥2 stops in the main cluster, with caption on hero", () => {
    const { container } = render(<TripCover {...base} stops={europe} size="hero" />);
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(screen.getByText("London → Rome")).toBeInTheDocument();
  });
  it("stamp with 0 or 1 stops", () => {
    render(<TripCover {...base} stops={[]} size="small" />);
    expect(screen.queryByText(/→/)).toBeNull();
    expect(screen.getByText("04 DEC 26")).toBeInTheDocument();
  });
  it("shows the add-photo affordance only when the viewer can edit", () => {
    const { rerender } = render(<TripCover {...base} stops={[]} size="hero" />);
    expect(screen.getByTestId("add-photo")).toBeInTheDocument();
    rerender(<TripCover {...base} stops={[]} size="hero" canEdit={false} />);
    expect(screen.queryByTestId("add-photo")).toBeNull();
  });
  it("small frames alternate rotation by index", () => {
    const { container: c0 } = render(<TripCover {...base} stops={[]} size="small" index={0} />);
    const { container: c1 } = render(<TripCover {...base} stops={[]} size="small" index={1} />);
    expect(c0.firstElementChild!.className).toContain("-rotate-[5deg]");
    expect(c1.firstElementChild!.className).toContain("rotate-[4deg]");
  });
  it("hero frame is responsive: mobile-hero sizing below md, hero sizing from md", () => {
    const { container } = render(<TripCover {...base} stops={[]} size="hero" />);
    expect(container.firstElementChild!.className).toContain("w-[86px]");
    expect(container.firstElementChild!.className).toContain("md:w-[150px]");
  });
});

describe("CoverArt", () => {
  it("renders the stamp without a frame in band mode", () => {
    const { container } = render(<CoverArt {...base} stops={[]} size="hero" box="band" />);
    expect(container.querySelector("[data-polaroid]")).toBeNull();
    expect(screen.getByText("04 DEC 26")).toBeInTheDocument();
  });
  it("renders the generated art underneath a photo", () => {
    render(<CoverArt {...base} photo={{ url: "/api/trips/t1/cover?v=1", focalX: null, focalY: null }} stops={europe} size="hero" />);
    expect(screen.getByTestId("cover-photo")).toBeInTheDocument();
    expect(document.querySelector("[data-cover-sketch], [data-cover-stamp]")).not.toBeNull();
  });
  it("band mode centres a 3:4 sketch inside a continuous map-fill ground (C1)", () => {
    const { container } = render(<CoverArt {...base} stops={europe} size="hero" box="band" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-map-fill");
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    let ancestor: HTMLElement | null = polyline!.parentElement;
    while (ancestor && !(ancestor.getAttribute("class") ?? "").includes("aspect-[3/4]")) ancestor = ancestor.parentElement;
    expect(ancestor).not.toBeNull();
  });
});
