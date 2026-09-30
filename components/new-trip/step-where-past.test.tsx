import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { findPlaces } = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));

import { StepWherePast } from "./step-where-past";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const KYOTO = { name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" };
const combo = () => screen.getByRole("combobox", { name: "Add a place" });
const past = { past: true, startDate: "2026-08-01", endDate: "2026-08-10" };

describe("StepWherePast", () => {
  beforeEach(() => findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [KYOTO] }));

  it("asks where you stopped, and it's optional", () => {
    render(<StepHarness Step={StepWherePast} initial={past} />);
    expect(screen.getByRole("heading", { level: 2, name: "Where did you stop?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByText("Show money in")).toBeInTheDocument();
  });

  it("a picked place becomes a removable chip with its coordinates", async () => {
    render(<StepHarness Step={StepWherePast} initial={past} />);
    await userEvent.type(combo(), "Kyo");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(currentDraft().stops).toEqual([{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }]);
    expect(combo()).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove Kyoto" }));
    expect(currentDraft().stops).toEqual([]);
  });

  it("Enter with typed text and no result adds it as written, without continuing", async () => {
    const onNext = vi.fn();
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
    render(<StepHarness Step={StepWherePast} initial={past} onNext={onNext} />);
    await userEvent.type(combo(), "Nowhereville{Enter}");
    expect(currentDraft().stops).toEqual([{ name: "Nowhereville" }]);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("Enter on an empty search continues", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepWherePast} initial={past} onNext={onNext} />);
    combo().focus();
    await userEvent.keyboard("{Enter}");
    expect(onNext).toHaveBeenCalled();
  });

  it("Continue adds a half-typed place first", async () => {
    const onNext = vi.fn();
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
    render(<StepHarness Step={StepWherePast} initial={past} onNext={onNext} />);
    await userEvent.type(combo(), "Nara");
    await userEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    expect(currentDraft().stops).toEqual([{ name: "Nara" }]);
    expect(onNext).toHaveBeenCalled();
  });
});
