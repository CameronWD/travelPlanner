import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("opens the installed app on the animated launch page", () => {
    expect(manifest().start_url).toBe("/launch.html");
  });
});
