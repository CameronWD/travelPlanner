import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { findPlaces } = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));

import { StepFrom } from "./step-from";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const PORTLAND = { name: "Portland, Multnomah County, Oregon, United States", lat: 45.52, lng: -122.68, city: "Portland", country: "United States", countryCode: "us" };
const DENPASAR = { name: "Denpasar, Bali, Indonesia", lat: -8.65, lng: 115.22, city: "Denpasar", country: "Indonesia", countryCode: "id" };
const combo = () => screen.getByRole("combobox", { name: "Leaving from" });

async function pick(query: string) {
  await userEvent.type(combo(), query);
  await screen.findAllByRole("option");
  await userEvent.keyboard("{Enter}");
}

describe("StepFrom", () => {
  beforeEach(() => findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [PORTLAND] }));

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
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("Picked from Portland. Costs in other currencies convert to this.")).toBeInTheDocument();
  });

  it("a place whose country has no currency here keeps the currency and the plain note", async () => {
    findPlaces.mockResolvedValue({ status: "ok", candidates: [DENPASAR] });
    render(<StepHarness Step={StepFrom} />);
    await pick("Denp");
    expect(currentDraft()).toMatchObject({ homeName: "Denpasar", homeCurrency: "AUD" });
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
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
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
