import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NowNextCard } from "./now-next-card";
import type { NowNext } from "@/lib/now-next";

const props = { tripId: "t1", dayMapHref: "/trips/x/day/2026-12-19#map" as Route };

describe("NowNextCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-19T08:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("in-transit shows the arrival in the arrival zone", () => {
    const nowNext: NowNext = {
      kind: "in-transit",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "Paris to London",
      arrivesName: "London",
      arrivesAt: "2026-12-19T09:30:00.000Z",
      arrivesZone: "Europe/London",
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText("Arrives London 09:30")).toBeInTheDocument();
  });

  it("a departure more than a day away shows the date, time and route with no countdown", () => {
    const nowNext: NowNext = {
      kind: "next-departure",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "Paris to London",
      departsAt: "2026-12-19T06:02:00.000Z",
      departsZone: "Europe/Paris",
      withinDay: false,
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText("Sat 19 Dec 07:02 · Paris to London")).toBeInTheDocument();
    expect(screen.queryByText(/\d+h \d+m|in \d+m/)).toBeNull();
  });

  it("a departure within a day shows the countdown", () => {
    const nowNext: NowNext = {
      kind: "next-departure",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "Paris to London",
      departsAt: new Date(Date.now() + 3 * 3_600_000 + 60_000).toISOString(),
      departsZone: "Europe/Paris",
      withinDay: true,
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText(/Next departure · in 3h/)).toBeInTheDocument();
    expect(screen.getByText("Paris to London")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Day map/ })).toHaveAttribute("href", props.dayMapHref);
  });

  it("a next thing with a place offers Directions as a 44px Google link, plus Day map", () => {
    const nowNext: NowNext = {
      kind: "next-thing",
      target: { type: "item", id: "i1" },
      title: "Louvre",
      startsAt: "2026-12-19T09:00:00.000Z",
      zone: "Europe/Paris",
      place: { lat: 48.86, lng: 2.34 },
      address: null,
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    const directions = screen.getByRole("link", { name: /Directions/ });
    expect(directions).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=48.86%2C2.34&travelmode=transit",
    );
    expect(directions.className).toContain("min-h-11");
    expect(screen.getByRole("link", { name: /Day map/ })).toHaveAttribute("href", props.dayMapHref);
  });

  it("a next thing with an address uses it as the destination", () => {
    const nowNext: NowNext = {
      kind: "next-thing",
      target: { type: "accommodation", id: "a1" },
      title: "Hotel",
      startsAt: null,
      zone: "Europe/Paris",
      place: null,
      address: "1 Rue de Rivoli",
    };
    render(<NowNextCard nowNext={nowNext} {...props} localMode="DRIVE" />);
    expect(screen.getByRole("link", { name: /Directions/ })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=1+Rue+de+Rivoli&travelmode=driving",
    );
  });

  it("a next thing with neither place nor address has no Directions but keeps the title", () => {
    const nowNext: NowNext = {
      kind: "next-thing",
      target: { type: "item", id: "i1" },
      title: "Free afternoon",
      startsAt: "2026-12-19T13:00:00.000Z",
      zone: "Europe/Paris",
      place: null,
      address: null,
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText(/Free afternoon/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Directions/ })).toBeNull();
  });

  it("nothing renders a quiet line", () => {
    render(<NowNextCard nowNext={{ kind: "nothing" }} {...props} />);
    expect(screen.getByText("Nothing left today")).toBeInTheDocument();
  });

  it("in-transit without an arrival name shows just the time", () => {
    const nowNext: NowNext = {
      kind: "in-transit",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "",
      arrivesName: null,
      arrivesAt: "2026-12-19T09:30:00.000Z",
      arrivesZone: "Europe/London",
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText("Arrives 09:30")).toBeInTheDocument();
  });

  it("in-transit arriving on a later day shows the day", () => {
    const at = new Date(Date.now() + 2 * 86_400_000);
    at.setUTCHours(5, 45, 0, 0);
    const nowNext: NowNext = {
      kind: "in-transit",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "Paris to Munich",
      arrivesName: "Munich",
      arrivesAt: at.toISOString(),
      arrivesZone: "UTC",
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText(/^Arrives Munich \w{3} \d+ \w{3} 05:45$/)).toBeInTheDocument();
  });

  it("a departure with no route label has no trailing separator", () => {
    const nowNext: NowNext = {
      kind: "next-departure",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "",
      departsAt: "2026-12-19T06:02:00.000Z",
      departsZone: "Europe/Paris",
      withinDay: false,
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText("Sat 19 Dec 07:02")).toBeInTheDocument();
  });

  it("a within-a-day departure that has already passed falls back to the plain line", () => {
    const nowNext: NowNext = {
      kind: "next-departure",
      transportId: "tr1",
      mode: "TRAIN",
      routeLabel: "Paris to London",
      departsAt: new Date(Date.now() - 60_000).toISOString(),
      departsZone: "UTC",
      withinDay: true,
    };
    render(<NowNextCard nowNext={nowNext} {...props} />);
    expect(screen.getByText(/· Paris to London$/)).toBeInTheDocument();
  });
});
