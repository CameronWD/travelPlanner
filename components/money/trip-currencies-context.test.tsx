import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCurrenciesProvider, useTripCurrencies } from "./trip-currencies-context";

function Probe() {
  const c = useTripCurrencies();
  return <div data-testid="p">{c ? `${c.homeCurrency}:${c.currencies.join(",")}` : "none"}</div>;
}

describe("useTripCurrencies", () => {
  it("is null with no provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("p")).toHaveTextContent("none");
  });

  it("returns what the provider was given", () => {
    render(
      <TripCurrenciesProvider homeCurrency="AUD" currencies={["AUD", "EUR"]}>
        <Probe />
      </TripCurrenciesProvider>,
    );
    expect(screen.getByTestId("p")).toHaveTextContent("AUD:AUD,EUR");
  });
});
