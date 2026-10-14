import { describe, expect, it } from "vitest";
import { htmlToText } from "./html-to-text";

describe("htmlToText", () => {
  it("drops tags, styles and scripts and keeps rows and cells apart", () => {
    const html = `<html><head><style>p{color:red}</style></head><body><script>x()</script>
      <p>Booking reference <b>QX7P2M</b></p><table><tr><td>Depart</td><td>10:00</td></tr><tr><td>Arrive</td><td>07:15</td></tr></table></body></html>`;
    expect(htmlToText(html)).toBe("Booking reference QX7P2M\nDepart\t10:00\t\nArrive\t07:15");
  });

  it("decodes common entities, numeric ones included", () => {
    expect(htmlToText("Caf&eacute; &amp; Bar &#8211; &#x41;&nbsp;B &lt;ok&gt; &quot;q&quot; &#39;s")).toBe("Caf&eacute; & Bar – A B <ok> \"q\" 's");
  });

  it("turns <br> into a line break and collapses blank runs", () => {
    expect(htmlToText("a<br>b<br/><br/><br/>c")).toBe("a\nb\n\nc");
  });
});
