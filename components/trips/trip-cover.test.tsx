import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCover, CoverArt } from "./trip-cover";
import { routeSnapshotModel, routeSnapshotPath } from "@/lib/trips/route-snapshot";

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
  { id: "l", name: "London", lat: 51.5, lng: -0.12, nights: 5, sortOrder: 0 },
  { id: "p", name: "Paris", lat: 48.85, lng: 2.35, nights: 4, sortOrder: 0 },
  { id: "r", name: "Rome", lat: 41.9, lng: 12.5, nights: 6, sortOrder: 0 },
];

const snapshotImg = (c: HTMLElement) => c.querySelector("img");

beforeEach(() => {
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => false });
});
afterEach(() => {
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
  vi.unstubAllEnvs();
});

describe("TripCover", () => {
  it("photo wins", () => {
    render(<TripCover {...base} photo={{ url: "/api/trips/t1/cover?v=k", focalX: null, focalY: null }} stops={europe} size="hero" />);
    expect(screen.getByRole("img", { name: "Christmas in Europe 2026 cover photo" })).toBeInTheDocument();
    expect(screen.queryByText("London → Rome")).toBeNull();
  });
  it("route snapshot with ≥2 stops in the main cluster, with caption on hero", () => {
    const { container } = render(<TripCover {...base} stops={europe} size="hero" />);
    expect(snapshotImg(container)).not.toBeNull();
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
  it("renders the stamp underneath a photo, and no map request", () => {
    const { container } = render(<CoverArt {...base} photo={{ url: "/api/trips/t1/cover?v=1", focalX: null, focalY: null }} stops={europe} size="hero" />);
    expect(screen.getByTestId("cover-photo")).toBeInTheDocument();
    expect(document.querySelector("[data-cover-stamp]")).not.toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
  it.each([
    ["3:4", "hero", "tall"],
    ["1:1", "small", "square"],
    ["band", "hero", "band"],
  ] as const)("box %s asks the route for the %s shape", (box, size, shape) => {
    const { container } = render(<CoverArt {...base} stops={europe} size={size} box={box} />);
    const model = routeSnapshotModel(europe)!;
    expect(snapshotImg(container)!.getAttribute("src")).toBe(routeSnapshotPath("t1", model, shape));
  });
  it("band mode fills with the map, no letterboxed sketch", () => {
    const { container } = render(<CoverArt {...base} stops={europe} size="hero" box="band" />);
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelector("[class*='aspect-[3/4]']")).toBeNull();
  });
  it("direct mode builds the static map URL from the main-cluster pins only", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
    const withBali = [{ id: "b", name: "Bali", lat: -8.65, lng: 115.13, nights: 4, sortOrder: 0 }, ...europe];
    const { container } = render(<CoverArt {...base} tripId="share" stops={withBali} size="hero" snapshot="direct" />);
    const src = snapshotImg(container)!.getAttribute("src")!;
    expect(src.startsWith("https://maps.googleapis.com/maps/api/staticmap")).toBe(true);
    expect(src).toContain("size=480x640");
    expect(src).not.toContain("-8.65");
    expect(src).toContain("51.5");
  });
  it("direct mode without a maps config shows the stamp", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    const { container } = render(<CoverArt {...base} stops={europe} size="hero" snapshot="direct" />);
    expect(snapshotImg(container)).toBeNull();
    expect(document.querySelector("[data-cover-stamp]")).not.toBeNull();
  });
  it("too few located stops shows the stamp and no img", () => {
    const { container } = render(<CoverArt {...base} stops={[europe[0]]} size="hero" />);
    expect(snapshotImg(container)).toBeNull();
    expect(document.querySelector("[data-cover-stamp]")).not.toBeNull();
  });
});
