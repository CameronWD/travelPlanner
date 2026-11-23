import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fileAttachment: vi.fn(),
  loadAttachmentIndexForMcp: vi.fn(),
  requireRealPlanRows: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({ fileAttachment: m.fileAttachment }));
vi.mock("../reads/attachments", () => ({ loadAttachmentIndexForMcp: m.loadAttachmentIndexForMcp }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: vi.fn(), requireRealPlanRows: m.requireRealPlanRows }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";
import { currentActivitySource, runAsTraveller } from "../acting-traveller";

const text = (r: Record<string, unknown>) => (r.content as { text: string }[])[0].text;
const file = (id: string) => ({ id, title: "Ticket", filename: "t.pdf", mime: "application/pdf", size: 1, uploadedBy: "Cam", owner: { kind: "TRIP", label: "Trip" } });

describe("attach_file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireRealPlanRows.mockResolvedValue(undefined);
    m.fileAttachment.mockResolvedValue({ success: true, tripId: "trip-1", attachmentIds: ["a1", "a2"] });
    m.loadAttachmentIndexForMcp.mockResolvedValue({ attachments: [file("a1"), file("a2"), file("other")] });
  });

  it("files onto the targets, mapping kind to type, and returns only the resulting files", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({
      name: "attach_file",
      arguments: { attachmentId: "a1", targets: [{ kind: "STOP", id: "s1" }, { kind: "TRIP" }], title: "Boarding pass" },
    });
    expect(m.requireRealPlanRows).toHaveBeenCalledWith([["stop", "s1"]]);
    expect(m.fileAttachment).toHaveBeenCalledWith("a1", [{ type: "STOP", id: "s1" }, { type: "TRIP" }], "Boarding pass");
    expect(m.loadAttachmentIndexForMcp).toHaveBeenCalledWith("trip-1");
    expect(JSON.parse(text(r))).toEqual({ attachments: [file("a1"), file("a2")] });
  });

  it("checks each kind of target as the right plan row", async () => {
    const c = await connectTestClient();
    await c.callTool({
      name: "attach_file",
      arguments: {
        attachmentId: "a1",
        targets: [{ kind: "ITEM", id: "i1" }, { kind: "TRANSPORT", id: "t1" }, { kind: "ACCOMMODATION", id: "ac1" }],
      },
    });
    expect(m.requireRealPlanRows).toHaveBeenCalledWith([["item", "i1"], ["transport", "t1"], ["accommodation", "ac1"]]);
    expect(m.fileAttachment).toHaveBeenCalledWith("a1", [
      { type: "ITEM", id: "i1" }, { type: "TRANSPORT", id: "t1" }, { type: "ACCOMMODATION", id: "ac1" },
    ], undefined);
  });

  it("a non-TRIP target without an id is a field error", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "attach_file", arguments: { attachmentId: "a1", targets: [{ kind: "STOP" }] } });
    expect(r.isError).toBe(true);
    expect(m.fileAttachment).not.toHaveBeenCalled();
  });

  it("takes 1 to 6 targets", async () => {
    const c = await connectTestClient();
    const none = await c.callTool({ name: "attach_file", arguments: { attachmentId: "a1", targets: [] } });
    const seven = await c.callTool({ name: "attach_file", arguments: { attachmentId: "a1", targets: Array.from({ length: 7 }, (_, i) => ({ kind: "STOP", id: `s${i}` })) } });
    expect(none.isError).toBe(true);
    expect(seven.isError).toBe(true);
    expect(m.fileAttachment).not.toHaveBeenCalled();
  });

  it("a Fork's row reads as not found and nothing is filed", async () => {
    m.requireRealPlanRows.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    const c = await connectTestClient();
    const r = await c.callTool({ name: "attach_file", arguments: { attachmentId: "a1", targets: [{ kind: "ITEM", id: "fork-item" }] } });
    expect(text(r)).toBe(NOT_FOUND_TEXT);
    expect(m.fileAttachment).not.toHaveBeenCalled();
  });

  it("surfaces the action's error text, partial result included", async () => {
    m.fileAttachment.mockResolvedValue({ success: false, errors: { _: ["Attached to 2 of 3. Try the rest again."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "attach_file", arguments: { attachmentId: "a1", targets: [{ kind: "TRIP" }] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Attached to 2 of 3. Try the rest again.");
    expect(m.loadAttachmentIndexForMcp).not.toHaveBeenCalled();
  });

  it("runs the action as Claude, so its Activity lines carry source CLAUDE", async () => {
    let source: string | null = null;
    m.fileAttachment.mockImplementation(async () => {
      source = currentActivitySource();
      return { success: true, tripId: "trip-1", attachmentIds: ["a1"] };
    });
    const c = await connectTestClient();
    await runAsTraveller({ id: "u1", name: "Cam", email: "c@x.test", image: null }, () =>
      c.callTool({ name: "attach_file", arguments: { attachmentId: "a1", targets: [{ kind: "TRIP" }] } }),
    );
    expect(source).toBe("CLAUDE");
  });

  it("offers no tool that uploads or deletes an Attachment", async () => {
    const c = await connectTestClient();
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toContain("attach_file");
    expect(names).not.toContain("delete_attachment");
    expect(names).not.toContain("upload_attachment");
  });
});
