import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapLink } from "./map-link";

describe("MapLink", () => {
  it("links a place with a placeId through query_place_id", () => {
    const html = renderToStaticMarkup(<MapLink lat={35.66} lng={139.7} label="Ichiran Shibuya" placeId="ChIJabc" />);
    expect(html).toContain("query_place_id=ChIJabc");
    expect(html).toContain("query=Ichiran%20Shibuya");
  });

  it("links by coordinates when there is no placeId", () => {
    const html = renderToStaticMarkup(<MapLink lat={1} lng={2} label="X" />);
    expect(html).toContain("query=1%2C2");
    expect(html).not.toContain("query_place_id");
  });
});
