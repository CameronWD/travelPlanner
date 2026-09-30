import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduced.current }));

import { MoneyEntrance, useMoneyEntrance, MONEY_COUNT_KEY } from "./money-entrance";

function Probe() {
  return <span data-testid="state">{useMoneyEntrance()}</span>;
}

beforeEach(() => {
  sessionStorage.clear();
  reduced.current = false;
});

describe("MoneyEntrance (MOTION M2: once per session per trip)", () => {
  it("plays the first time and remembers it", () => {
    render(
      <MoneyEntrance tripId="t1">
        <Probe />
      </MoneyEntrance>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("play");
    expect(sessionStorage.getItem(MONEY_COUNT_KEY("t1"))).not.toBeNull();
  });
  it("is static on the next visit, and per trip", () => {
    sessionStorage.setItem(MONEY_COUNT_KEY("t1"), "1");
    render(
      <MoneyEntrance tripId="t1">
        <Probe />
      </MoneyEntrance>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("static");
  });
  it("is static under reduced motion", () => {
    reduced.current = true;
    render(
      <MoneyEntrance tripId="t2">
        <Probe />
      </MoneyEntrance>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("static");
  });
});
