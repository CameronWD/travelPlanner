import { describe, it, expect } from "vitest";
import config from "./next.config";

describe("next.config", () => {
  it("keeps dynamic pages in the client router cache for 30s (ADR 0063)", () => {
    expect(config.experimental?.staleTimes?.dynamic).toBe(30);
  });
});
