import { describe, expect, it } from "vitest";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";

describe("Booking import copy", () => {
  it("keeps the spec's failure messages", () => {
    expect(M.unreadable).toBe("We couldn't read that file. Try a screenshot of the booking instead.");
    expect(M.notBooking("it is a newsletter.")).toBe("This doesn't look like a booking: it is a newsletter.");
    expect(M.notBooking(null)).toBe("This doesn't look like a booking.");
    expect(M.rateLimited(12)).toBe("You've done a lot of imports this hour. Try again in 12 minutes.");
    expect(M.rateLimited(1)).toBe("You've done a lot of imports this hour. Try again in 1 minute.");
    expect(M.blocked).toBe("This belongs to a Stop you can't add to");
    expect(M.heic).toContain("share it as a screenshot or JPEG");
    expect(M.msg).toContain("forward it or paste the text");
  });

  it("has no em-dashes (copy rule) in any message", () => {
    const all = Object.values(M).map((v) => (typeof v === "function" ? (v as (...a: unknown[]) => string)("x", "y") : v));
    for (const text of all) expect(text).not.toContain("—");
  });
});
