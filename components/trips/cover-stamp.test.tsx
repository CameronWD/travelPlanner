import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverStamp, stampPlace, stampDate } from "./cover-stamp";

describe("stampDate", () => {
  it("formats DD MON YY", () => {
    expect(stampDate("2026-12-04")).toBe("04 DEC 26");
  });
});

describe("stampPlace", () => {
  it("uses the one stop's name", () => {
    expect(stampPlace({ stops: [{ name: "Queenstown" }], name: "New Zealand", size: "small" })).toBe("Queenstown");
  });
  it("uses the trip name with 0 stops, abbreviated on small when over 8 chars", () => {
    expect(stampPlace({ stops: [], name: "New Zealand", size: "small" })).toBe("NZ");
    expect(stampPlace({ stops: [], name: "Bali", size: "small" })).toBe("Bali");
    expect(stampPlace({ stops: [], name: "New Zealand", size: "hero" })).toBe("New Zealand");
  });
});

describe("CoverStamp", () => {
  it("hero shows ARRIVED, place and date; is aria-hidden", () => {
    const { container } = render(<CoverStamp name="Christmas in Europe" place="EUROPE" startDate="2026-12-04" hue="coral" size="hero" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/ARRIVED/)).toBeInTheDocument();
    expect(screen.getByText("EUROPE")).toBeInTheDocument();
    expect(screen.getByText("04 DEC 26")).toBeInTheDocument();
    expect(container.querySelector(".text-hue-coral-ink")).not.toBeNull();
  });
  it("no start date: SOMEDAY and no date row", () => {
    render(<CoverStamp name="Japan" place="JAPAN" startDate={null} hue="teal" size="hero" />);
    expect(screen.getByText(/SOMEDAY/)).toBeInTheDocument();
    expect(screen.queryByText(/\d{2} [A-Z]{3} \d{2}/)).toBeNull();
  });
  it("small omits ARRIVED", () => {
    render(<CoverStamp name="NZ" place="NZ" startDate="2027-04-23" hue="teal" size="small" />);
    expect(screen.queryByText(/ARRIVED/)).toBeNull();
    expect(screen.getByText("23 APR 27")).toBeInTheDocument();
  });
  it("sits on a soft wash of the Trip colour, not the bare card (Feedback cmumchso1000204l0s15n8asx)", () => {
    const { container } = render(<CoverStamp name="New Zealand" place="NZ" startDate={null} hue="teal" size="small" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className.split(/\s+/)).toContain("bg-hue-teal/25");
    expect(root.className.split(/\s+/)).not.toContain("bg-background");
  });
});
