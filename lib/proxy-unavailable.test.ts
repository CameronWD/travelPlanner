import { describe, expect, it } from "vitest";
import { unavailablePage } from "./proxy-unavailable";

describe("unavailablePage", () => {
  it("carries the copy and a link back to the same URL", () => {
    const html = unavailablePage("/trips/x/day/2026-12-09", "?map=1");
    expect(html).toContain("<title>Teepee</title>");
    expect(html).toContain("That didn't load. It's probably the connection.");
    expect(html).toContain('<a href="/trips/x/day/2026-12-09?map=1">Try again</a>');
  });

  it("cannot be broken out of the href attribute", () => {
    const html = unavailablePage('/trips/"><script>x</script>', '?a=1&b="2"');
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="/trips/&quot;&gt;&lt;script&gt;x&lt;/script&gt;?a=1&amp;b=&quot;2&quot;"');
  });
});
