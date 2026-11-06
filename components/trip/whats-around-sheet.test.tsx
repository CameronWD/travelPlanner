import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WhatsAroundSheet, compactCount, walkMinutes } from "@/components/trip/whats-around-sheet";

const whatsAround = vi.fn();
const createItem = vi.fn();
vi.mock("@/server/actions/whats-around", () => ({ whatsAround: (...a: unknown[]) => whatsAround(...a) }));
vi.mock("@/server/actions/items", () => ({ createItem: (...a: unknown[]) => createItem(...a) }));
const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

const hours = { weekly: [] } as never;
const place = {
  placeId: "p1", name: "Cathédrale", lat: 48.5819, lng: 7.7509, address: "Pl. de la Cathédrale", typeLabel: "Church",
  rating: 4.7, ratingCount: 21000, openNow: true, closesAt: "18:30", openingHours: hours, businessStatus: "OPERATIONAL", website: "https://example.com",
};
const ok = (places = [place]) => ({ status: "ok", places, origin: { lat: 48.5839, lng: 7.7455 } });
const startPoints = [
  { key: "acc", label: "Tonight's stay", from: { kind: "accommodation" as const, id: "a1" } },
  { key: "stop", label: "Strasbourg", from: { kind: "stop" as const, id: "s1" } },
];

function setup(props: Partial<React.ComponentProps<typeof WhatsAroundSheet>> = {}) {
  render(<WhatsAroundSheet tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" stopId="s1" startPoints={startPoints} allowNearMe={false} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "What's around" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  whatsAround.mockResolvedValue(ok());
  createItem.mockResolvedValue({ success: true, data: { id: "i1" } });
});

describe("WhatsAroundSheet", () => {
  it("defaults to the first start point and Sights", async () => {
    setup();
    await screen.findByText("Cathédrale");
    expect(whatsAround).toHaveBeenCalledWith("t1", { from: { kind: "accommodation", id: "a1" }, nearbyKind: "sights" });
  });
  it("refetches on a kind switch", async () => {
    setup();
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    await waitFor(() => expect(whatsAround).toHaveBeenLastCalledWith("t1", { from: { kind: "accommodation", id: "a1" }, nearbyKind: "food" }));
  });
  it("shows rating, walk and open-until", async () => {
    setup();
    await screen.findByText("Cathédrale");
    expect(screen.getByText(/★ 4\.7 \(21k\)/)).toBeInTheDocument();
    expect(screen.getByText(/~\d+ min walk/)).toBeInTheDocument();
    expect(screen.getByText(/Open until 18:30/)).toBeInTheDocument();
  });
  it("links the name to Maps with the placeId", async () => {
    setup();
    const link = await screen.findByRole("link", { name: "Cathédrale" });
    expect(link.getAttribute("href")).toContain("query_place_id=p1");
    expect(link).toHaveAttribute("target", "_blank");
  });
  it("+ Day creates a dated Item on the Stop with category and hours", async () => {
    setup();
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "+ Day: add Cathédrale to Sat 12 Dec" }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(createItem).toHaveBeenCalledWith("t1", expect.objectContaining({
      title: "Cathédrale", category: "SIGHTSEEING", date: "2026-12-12", stopId: "s1", placeId: "p1", openingHours: hours, link: "https://example.com/", businessStatus: "OPERATIONAL",
    }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Added to Sat 12 Dec" })));
  });
  it("+ Day on a Gap day sends no stopId", async () => {
    setup({ stopId: null });
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "+ Day: add Cathédrale to Sat 12 Dec" }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    const input = createItem.mock.calls[0][1];
    expect(input.date).toBe("2026-12-12");
    expect("stopId" in input).toBe(false);
  });
  it("Wishlist omits date and stopId", async () => {
    setup();
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "♡ Wishlist: save Cathédrale" }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    const input = createItem.mock.calls[0][1];
    expect("date" in input).toBe(false);
    expect("stopId" in input).toBe(false);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved to the Wishlist" })));
  });
  it("shows the over-cap copy", async () => {
    whatsAround.mockResolvedValue({ status: "over-cap" });
    setup();
    expect(await screen.findByText("That's all the looking around for today. Try again tomorrow.")).toBeInTheDocument();
  });
  it("shows the empty copy", async () => {
    whatsAround.mockResolvedValue(ok([]));
    setup();
    expect(await screen.findByText("Nothing like that nearby.")).toBeInTheDocument();
  });
  it("shows the attribution", async () => {
    setup();
    await screen.findByText("Cathédrale");
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
  });
  it("Near me: denied location shows the message and keeps other chips", async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err({ code: 1 }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    setup({ allowNearMe: true });
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "Near me" }));
    expect(await screen.findByText("Location is off for this site.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tonight's stay" })).toBeInTheDocument();
  });
  it("Near me: sends the device point only after the tap", async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 1.5, longitude: 2.5 } }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    setup({ allowNearMe: true });
    await screen.findByText("Cathédrale");
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Near me" }));
    await waitFor(() => expect(whatsAround).toHaveBeenLastCalledWith("t1", { from: { kind: "device", lat: 1.5, lng: 2.5 }, nearbyKind: "sights" }));
  });
  it("Near me: a non-denial error shows the other copy", async () => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: vi.fn((_ok, err) => err({ code: 3 })) }, configurable: true });
    setup({ allowNearMe: true });
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "Near me" }));
    expect(await screen.findByText("Couldn't get your location. Try again.")).toBeInTheDocument();
  });
  it("a late Food response does not replace Sights, and +Day keeps SIGHTSEEING", async () => {
    let resolveFood: (v: unknown) => void = () => {};
    whatsAround.mockImplementation((_t, { nearbyKind }) =>
      nearbyKind === "food" ? new Promise((r) => { resolveFood = r; }) : Promise.resolve(ok()),
    );
    setup();
    await screen.findByText("Cathédrale");
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Sights" }));
    await screen.findByText("Cathédrale");
    resolveFood(ok([{ ...place, placeId: "p2", name: "Winstub" }]));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Winstub")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Day: add Cathédrale to Sat 12 Dec" }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(createItem.mock.calls[0][1].category).toBe("SIGHTSEEING");
  });
});

describe("helpers", () => {
  it("compactCount", () => {
    expect([999, 1234, 10000, 21000].map(compactCount)).toEqual(["999", "1.2k", "10k", "21k"]);
  });
  it("walkMinutes uses 1.3 / 4.8 km/h with a floor of 1", () => {
    expect(walkMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(1);
    expect(walkMinutes({ lat: 0, lng: 0 }, { lat: 0.0449, lng: 0 })).toBe(Math.round(((0.0449 * 111.195 * 1.3) / 4.8) * 60));
  });
});
