import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { StepFrom } from "./step-from";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const PORTLAND = { placeId: "ChIJPortland", mainText: "Portland", secondaryText: "OR, USA", lat: 45.52, lng: -122.68, formattedAddress: "Portland, OR, USA", countryCode: "us", country: "United States" };
const HANOI = { placeId: "ChIJHanoi", mainText: "Hanoi", secondaryText: "Vietnam", lat: 21.03, lng: 105.85, formattedAddress: "Hanoi, Vietnam", countryCode: "vn", country: "Vietnam" };
const combo = () => screen.getByRole("combobox", { name: "Leaving from" });

async function pick(query: string) {
  await userEvent.type(combo(), query);
  await screen.findAllByRole("option");
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(currentDraft().homePlace).toBeDefined());
}

describe("StepFrom", () => {
  beforeEach(() => {
    mock.reset();
    mock.places.predictions = [PORTLAND];
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks where you're leaving from, with the search focused", () => {
    render(<StepHarness Step={StepFrom} />);
    expect(screen.getByRole("heading", { level: 2, name: "Leaving from?" })).toBeInTheDocument();
    expect(screen.getByText("Your home base. It's where the trip starts and ends.")).toBeInTheDocument();
    expect(combo()).toHaveFocus();
  });

  it("picking a place sets the home and the currency, and says so", async () => {
    render(<StepHarness Step={StepFrom} />);
    await pick("Portl");
    expect(currentDraft()).toMatchObject({ homeName: "Portland", homeCurrency: "USD" });
    expect(currentDraft().homePlace).toMatchObject({ placeId: "ChIJPortland", lat: 45.52, lng: -122.68, countryCode: "us" });
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("Picked from Portland. Costs in other currencies convert to this.")).toBeInTheDocument();
  });

  it("a place whose country has no currency here keeps the currency and the plain note", async () => {
    mock.places.predictions = [HANOI];
    render(<StepHarness Step={StepFrom} />);
    await pick("Hano");
    expect(currentDraft()).toMatchObject({ homeName: "Hanoi", homeCurrency: "AUD" });
    expect(screen.getByText("Costs in other currencies convert to this.")).toBeInTheDocument();
    expect(screen.queryByText(/Picked from/)).toBeNull();
  });

  it("Enter on a highlighted home result picks it and stays on step 3", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepFrom} onNext={onNext} />);
    await pick("Portl");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("a typed place with no pick is kept as free text", async () => {
    mock.places.predictions = [];
    render(<StepHarness Step={StepFrom} />);
    await userEvent.type(combo(), "Sydneyish");
    expect(currentDraft().homeName).toBe("Sydneyish");
    expect(currentDraft().homePlace).toBeUndefined();
  });

  it("Change sets another currency", async () => {
    render(<StepHarness Step={StepFrom} />);
    await userEvent.click(screen.getByRole("button", { name: /Change currency/ }));
    await userEvent.click(screen.getByRole("button", { name: /JPY/ }));
    expect(currentDraft().homeCurrency).toBe("JPY");
  });

  it("Skip clears the home and moves on", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepFrom} onNext={onNext} initial={{ homeName: "Somewhere" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onNext).toHaveBeenCalled();
    expect(currentDraft().homeName).toBeUndefined();
  });
});
