import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TodayTile } from "./today-tile";

type Props = Parameters<typeof TodayTile>[0];

function renderTile(overrides: Partial<Props> = {}) {
  return render(
    <TodayTile
      dayHref="/trips/t1/day/2026-12-08"
      dateISO="2026-12-08"
      dayTitle="Temple day"
      plan={<ol data-testid="plan-list"><li>Uluwatu</li></ol>}
      nextTransport={{ label: "Ferry · Sanur → Nusa Lembongan", depTimeLabel: "09:40", depZone: "WITA" }}
      tonight={{ name: "Kuta pool villa", address: "Jl. Legian 12" }}
      {...overrides}
    />,
  );
}

describe("TodayTile", () => {
  it("is headed by an h2 'Today' with the day label and today's Day title", () => {
    renderTile();
    expect(screen.getByRole("heading", { level: 2, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Tue 8 Dec")).toBeInTheDocument();
    expect(screen.getByText("Temple day")).toBeInTheDocument();
  });

  it("shows today's plan, the next Transport and tonight's stay, in that order", () => {
    renderTile();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Today's plan", "Next transport", "Tonight's stay"]);
    expect(screen.getByTestId("plan-list")).toBeInTheDocument();
    expect(screen.getByText("Ferry · Sanur → Nusa Lembongan")).toBeInTheDocument();
    expect(screen.getByText("Leaves 09:40 WITA")).toBeInTheDocument();
    expect(screen.getByText("Kuta pool villa")).toBeInTheDocument();
    expect(screen.getByText("Jl. Legian 12")).toBeInTheDocument();
  });

  it("links to the full day view", () => {
    renderTile();
    expect(screen.getByRole("link", { name: /full day view/i })).toHaveAttribute("href", "/trips/t1/day/2026-12-08");
  });

  it("has quiet empty lines when nothing is planned, no Transport is ahead and no stay is booked", () => {
    renderTile({ plan: null, nextTransport: null, tonight: null, dayTitle: null });
    expect(screen.getByText("Nothing planned")).toBeInTheDocument();
    expect(screen.getByText("No more legs booked")).toBeInTheDocument();
    expect(screen.getByText("No stay booked")).toBeInTheDocument();
    expect(screen.queryByText("Temple day")).toBeNull();
  });

  it("never uses 'hotel' or 'event' in its copy", () => {
    const { container } = renderTile({ plan: null, nextTransport: null, tonight: null });
    expect(within(container).queryByText(/hotel|event/i)).toBeNull();
  });
});
