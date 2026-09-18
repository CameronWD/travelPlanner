import { describe, expect, it } from "vitest";
import { deviceLabelFromUserAgent } from "@/lib/device-label";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

describe("deviceLabelFromUserAgent", () => {
  it("names the Apple mobile devices", () => {
    expect(deviceLabelFromUserAgent(IPHONE)).toBe("iPhone");
    expect(deviceLabelFromUserAgent(IPAD)).toBe("iPad");
  });

  it("names a Mac", () => {
    expect(deviceLabelFromUserAgent(MAC)).toBe("Mac");
  });

  // Android carries "Linux" in its UA string, so order of checks is the whole
  // test: a naive Linux check first would label every phone "Linux".
  it("prefers Android over the Linux its UA also claims", () => {
    expect(deviceLabelFromUserAgent(ANDROID)).toBe("Android");
  });

  it("names the desktop platforms", () => {
    expect(deviceLabelFromUserAgent(WINDOWS)).toBe("Windows");
    expect(deviceLabelFromUserAgent(LINUX)).toBe("Linux");
  });

  it("returns null rather than guessing", () => {
    expect(deviceLabelFromUserAgent(null)).toBeNull();
    expect(deviceLabelFromUserAgent(undefined)).toBeNull();
    expect(deviceLabelFromUserAgent("")).toBeNull();
    expect(deviceLabelFromUserAgent("curl/8.4.0")).toBeNull();
  });

  // The value is rendered straight into the device list and stored forever.
  // Nothing outside the allow-list may ever reach the database.
  it("only ever returns a value from the allow-list", () => {
    const allowed = ["iPhone", "iPad", "Mac", "Android", "Windows", "Linux", null];
    for (const ua of [IPHONE, IPAD, MAC, ANDROID, WINDOWS, LINUX, "nonsense", ""]) {
      expect(allowed).toContain(deviceLabelFromUserAgent(ua));
    }
  });
});
