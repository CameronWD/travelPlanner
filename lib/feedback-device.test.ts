import { describe, expect, it } from "vitest";
import { describeDevice } from "@/lib/feedback-device";

describe("describeDevice", () => {
  it("has nothing to say about a missing agent", () => {
    expect(describeDevice(null)).toBeNull();
    expect(describeDevice("")).toBeNull();
    expect(describeDevice("   ")).toBeNull();
  });

  it("names an iPhone on Safari", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Safari");
  });

  it("names an iPad rather than calling it a Mac", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/604.1",
      ),
    ).toBe("iPad · Safari");
  });

  it("names Chrome on a Mac without mistaking it for Safari", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      ),
    ).toBe("Mac · Chrome");
  });

  it("names Edge without mistaking it for Chrome", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      ),
    ).toBe("Windows · Edge");
  });

  it("names Chrome on iOS by its real name", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Chrome");
  });

  it("names Firefox on Android", () => {
    expect(
      describeDevice("Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0"),
    ).toBe("Android · Firefox");
  });

  it("keeps a recognised platform even when the browser is unknown", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) SomeNewThing/1.0")).toBe(
      "Windows",
    );
  });

  it("truncates an unrecognised agent instead of pasting all of it in", () => {
    const summary = describeDevice("x".repeat(200));
    expect(summary).toBe(`${"x".repeat(59)}…`);
    expect(summary).toHaveLength(60);
  });

  it("leaves a short unrecognised agent alone", () => {
    expect(describeDevice("TeepeeBot/1.0")).toBe("TeepeeBot/1.0");
  });
});
