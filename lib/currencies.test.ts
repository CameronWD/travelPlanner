import { describe, it, expect } from "vitest";
import { CURRENCIES, currencyName, DEFAULT_HOME_CURRENCY } from "./currencies";

describe("currencies", () => {
  it("currencyName returns the full name for a known code", () => {
    expect(currencyName("EUR")).toBe("Euro");
  });

  it("currencyName returns the code itself for an unknown code", () => {
    expect(currencyName("XXX")).toBe("XXX");
  });

  it("CURRENCIES list contains AUD", () => {
    const aud = CURRENCIES.find((c) => c.code === "AUD");
    expect(aud).toBeDefined();
    expect(aud?.name).toBe("Australian Dollar");
  });

  it("CURRENCIES list contains at least 10 entries", () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(10);
  });

  it("DEFAULT_HOME_CURRENCY is AUD", () => {
    expect(DEFAULT_HOME_CURRENCY).toBe("AUD");
  });
});
