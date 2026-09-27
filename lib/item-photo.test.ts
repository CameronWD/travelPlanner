import { describe, it, expect } from "vitest";
import { itemPhotoUrl } from "./item-photo";

describe("itemPhotoUrl", () => {
  it("returns null when the Item has no photo set", () => {
    expect(itemPhotoUrl({ photoAttachmentId: null }, {})).toBeNull();
  });

  it("returns the Attachment's url when the id resolves (plain object lookup)", () => {
    const url = itemPhotoUrl(
      { photoAttachmentId: "att-1" },
      { "att-1": { url: "/api/attachments/att-1" } },
    );
    expect(url).toBe("/api/attachments/att-1");
  });

  it("returns the Attachment's url when the id resolves (Map lookup)", () => {
    const map = new Map([["att-1", { url: "/api/attachments/att-1" }]]);
    expect(itemPhotoUrl({ photoAttachmentId: "att-1" }, map)).toBe("/api/attachments/att-1");
  });

  it("resolves leniently: a stale/missing id renders no photo instead of throwing", () => {
    expect(itemPhotoUrl({ photoAttachmentId: "deleted-att" }, {})).toBeNull();
    expect(() => itemPhotoUrl({ photoAttachmentId: "deleted-att" }, new Map())).not.toThrow();
  });
});
