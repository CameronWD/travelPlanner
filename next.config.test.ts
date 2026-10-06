import { describe, it, expect } from "vitest";
import config from "./next.config";

describe("next.config", () => {
  it("keeps dynamic pages in the client router cache for 30s (ADR 0063)", () => {
    expect(config.experimental?.staleTimes?.dynamic).toBe(30);
  });

  it("permanently redirects the retired /signin to the Landing", async () => {
    const rules = await config.redirects!();
    expect(rules).toContainEqual({ source: "/signin", destination: "/", permanent: true });
  });

  it("turns the React Compiler on for the whole app (spec 2026-10-06 §I)", () => {
    expect(config.reactCompiler).toBe(true);
  });

  it("exposes a build id to the client for the service worker's static cache (spec 2026-10-06 §T)", () => {
    expect(typeof config.env?.NEXT_PUBLIC_BUILD_ID).toBe("string");
    expect(config.env!.NEXT_PUBLIC_BUILD_ID!.length).toBeGreaterThan(0);
  });
});
