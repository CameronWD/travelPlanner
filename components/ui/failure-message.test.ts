import { describe, it, expect, afterEach } from "vitest";
import { failureMessage, OFFLINE_MESSAGE } from "./failure-message";

const ORIGINAL_ONLINE = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

afterEach(() => {
  // Put jsdom's own getter back so other files see the real value.
  if (ORIGINAL_ONLINE) Object.defineProperty(navigator, "onLine", ORIGINAL_ONLINE);
});

describe("failureMessage", () => {
  it("returns the caller's wording while online", () => {
    setOnLine(true);
    expect(failureMessage("Something went wrong — nothing was changed. Try again.")).toBe(
      "Something went wrong — nothing was changed. Try again.",
    );
  });

  it("names the connection when the device is offline at the time of the failure", () => {
    setOnLine(false);
    expect(failureMessage("Something went wrong — nothing was changed. Try again.")).toBe(OFFLINE_MESSAGE);
    expect(OFFLINE_MESSAGE).toBe("You're offline. Plan changes need a connection.");
  });

  it("reads navigator at call time, not at import time", () => {
    setOnLine(true);
    expect(failureMessage("generic")).toBe("generic");
    setOnLine(false);
    expect(failureMessage("generic")).toBe(OFFLINE_MESSAGE);
  });
});
