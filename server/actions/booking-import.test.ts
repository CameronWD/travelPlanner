import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { SAMPLE_EXTRACTION, STAY } from "@/test/fixtures/booking-import/sample-extraction";
import { NO_EXISTING } from "@/lib/booking-import/duplicates";
import { BOOKING_IMPORT_MESSAGES as M } from "@/lib/booking-import/messages";
import type { MatchContext } from "@/lib/booking-import/build";
import type { ImportContext } from "@/lib/booking-import/types";

const m = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  requirePlanAccess: vi.fn(),
  isAiConfigured: vi.fn(),
  prepare: vi.fn(),
  extract: vi.fn(),
  load: vi.fn(),
  record: vi.fn(),
  report: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: m.requireTripAccess, requirePlanAccess: m.requirePlanAccess }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: m.isAiConfigured, aiModel: () => "claude-haiku-5-5" }));
vi.mock("@/lib/booking-import/input", () => ({ prepareBookingInput: m.prepare }));
vi.mock("@/lib/booking-import/extract", () => ({ extractBooking: m.extract }));
vi.mock("@/lib/booking-import/load-context", () => ({ loadImportContext: m.load }));
vi.mock("@/lib/ai-usage", () => ({ recordAiUsage: m.record }));
vi.mock("@/lib/error-sink", () => ({ reportError: m.report }));
vi.mock("@/lib/booking-import/confirm", () => ({ confirmProposalFor: m.confirm }));

import { confirmProposal, importBooking } from "./booking-import";

const USAGE = { inputTokens: 5_200, outputTokens: 900, cacheReadTokens: 0, cacheWriteTokens: 0 };
const LISBON = { id: "s-lis", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08", sortOrder: 0 };
const MATCH: MatchContext = { home: { name: "Brisbane", countryCode: "au", timezone: "Australia/Brisbane" }, stops: [LISBON], blockedStopIds: new Set(), existing: NO_EXISTING, today: "2026-10-14" };
const CONTEXT: ImportContext = { homeName: "Brisbane", homeTimezone: "Australia/Brisbane", homeCurrency: "AUD", stops: [LISBON] };

let user = 0;
function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  user += 1; // a fresh Traveller per test: the limiter is module state
  m.requireTripAccess.mockResolvedValue({ user: { id: `u${user}` }, membership: { role: "owner" } });
  m.requirePlanAccess.mockImplementation(async (_tripId: string, forkId?: string | null) => ({
    user: { id: `u${user}` },
    membership: { role: "owner" },
    plan: forkId ?? null,
  }));
  m.isAiConfigured.mockReturnValue(true);
  m.prepare.mockResolvedValue({ ok: true, source: "text", parts: [{ type: "text", text: "booking" }] });
  m.extract.mockResolvedValue({ kind: "ok", model: "claude-haiku-5-5", usage: USAGE, extraction: SAMPLE_EXTRACTION });
  m.load.mockResolvedValue({ match: MATCH, context: CONTEXT });
});

describe("importBooking", () => {
  it("checks access before reading anything, then returns Proposals and logs one usage row", async () => {
    const result = await importBooking(form({ tripId: "trip-1", forkId: "fork-1", text: "booking" }));
    expect(m.requireTripAccess).toHaveBeenCalledWith("trip-1");
    expectAccessCheckedBeforeWrite(m.requireTripAccess, m.extract);
    expect(m.prepare).toHaveBeenCalledWith({ file: null, text: "booking" });
    expect(m.load).toHaveBeenCalledWith("trip-1", "fork-1", `u${user}`);
    expect(result).toMatchObject({ success: true, partial: false, context: CONTEXT });
    if (result.success) expect(result.proposals.map((p) => p.clientId)).toEqual(["p1", "p2", "p3"]);
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-1", userId: `u${user}`, model: "claude-haiku-5-5", usage: USAGE, proposalCount: 3, outcome: "ok" }));
  });

  it("passes a chosen file through", async () => {
    const file = new File(["%PDF"], "ticket.pdf", { type: "application/pdf" });
    await importBooking(form({ tripId: "trip-1", file }));
    expect(m.prepare.mock.calls[0][0].file).toBeInstanceOf(File);
    expect(m.load).toHaveBeenCalledWith("trip-1", null, `u${user}`);
  });

  it("is refused when AI isn't configured, without reading anything", async () => {
    m.isAiConfigured.mockReturnValue(false);
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "disabled", errors: { _: [M.disabled] } });
    expect(m.prepare).not.toHaveBeenCalled();
  });

  it("returns an input failure as is, with no API call and no usage row", async () => {
    m.prepare.mockResolvedValue({ ok: false, reason: "invalid_file", message: M.heic });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "invalid_file", errors: { _: [M.heic] } });
    expect(m.extract).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });

  it("says when it isn't a booking", async () => {
    m.extract.mockResolvedValue({ kind: "ok", model: "claude-haiku-5-5", usage: USAGE, extraction: { isBooking: false, notBookingReason: "it is a newsletter", bookedOn: null, proposals: [] } });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "not_booking", errors: { _: ["This doesn't look like a booking: it is a newsletter."] } });
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "not_booking", proposalCount: 0 }));
  });

  it("says when a booking has nothing it could add", async () => {
    m.extract.mockResolvedValue({ kind: "ok", model: "claude-haiku-5-5", usage: USAGE, extraction: { ...SAMPLE_EXTRACTION, proposals: [] } });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "nothing_usable", errors: { _: [M.nothingUsable] } });
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "ok", proposalCount: 0 }));
  });

  it("flags a partial result when something was dropped", async () => {
    const backwards = { ...STAY, accommodation: { ...STAY.accommodation!, checkIn: "2026-12-08", checkOut: "2026-12-02" } };
    m.extract.mockResolvedValue({ kind: "ok", model: "claude-haiku-5-5", usage: USAGE, extraction: { ...SAMPLE_EXTRACTION, proposals: [...SAMPLE_EXTRACTION.proposals, backwards] } });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toMatchObject({ success: true, partial: true });
  });

  it("unreadable: reports the fixed-message error and logs the tokens spent", async () => {
    const report = new Error("Booking import: stop_reason max_tokens");
    m.extract.mockResolvedValue({ kind: "unreadable", model: "claude-haiku-5-5", usage: USAGE, report });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "unreadable", errors: { _: [M.unreadable] } });
    expect(m.report).toHaveBeenCalledWith(report, expect.objectContaining({ route: "booking-import", source: "server" }));
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unreadable", usage: USAGE }));
  });

  it("busy: no error report; usage logged as api_error", async () => {
    m.extract.mockResolvedValue({ kind: "busy", model: "claude-haiku-5-5", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "busy", errors: { _: [M.busy] } });
    expect(m.report).not.toHaveBeenCalled();
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "api_error" }));
  });

  it("a bad key or our own 400: generic message plus an error report", async () => {
    m.extract.mockResolvedValue({ kind: "api_error", model: "claude-haiku-5-5", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, status: 401 });
    expect(await importBooking(form({ tripId: "trip-1", text: "x" }))).toEqual({ success: false, code: "error", errors: { _: [M.generic] } });
    expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: "Booking import: Anthropic API error 401" }), expect.anything());
  });

  it("allows 20 imports an hour per Traveller, then says how long to wait", async () => {
    for (let i = 0; i < 20; i++) expect((await importBooking(form({ tripId: "trip-1", text: "x" }))).success).toBe(true);
    const refused = await importBooking(form({ tripId: "trip-1", text: "x" }));
    expect(refused).toEqual({ success: false, code: "rate_limited", errors: { _: [M.rateLimited(60)] }, retryInMinutes: 60 });
    expect(m.extract).toHaveBeenCalledTimes(20);
    expect(m.record).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "rate_limited", proposalCount: 0 }));
  });

  it("still writes the usage row when the Trip can't be read after a paid call (BI-13)", async () => {
    m.load.mockRejectedValue(new Error("connection reset"));
    await expect(importBooking(form({ tripId: "trip-1", text: "x" }))).rejects.toThrow("connection reset");
    expect(m.record).toHaveBeenCalledOnce();
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-1", userId: `u${user}`, model: "claude-haiku-5-5", usage: USAGE, proposalCount: 0, outcome: "error" }),
    );
  });

  it("writes exactly one usage row on success and on nothing-usable (Review Focus 1)", async () => {
    await importBooking(form({ tripId: "trip-1", text: "x" }));
    expect(m.record).toHaveBeenCalledOnce();
    m.record.mockClear();
    m.extract.mockResolvedValue({ kind: "ok", model: "claude-haiku-5-5", usage: USAGE, extraction: { ...SAMPLE_EXTRACTION, proposals: [] } });
    await importBooking(form({ tripId: "trip-1", text: "x" }));
    expect(m.record).toHaveBeenCalledOnce();
  });
});

describe("confirmProposal", () => {
  it("checks access, then confirms as the signed-in Traveller", async () => {
    m.confirm.mockResolvedValue({ success: true, createdId: "t-new", createdStops: {} });
    const request = { proposal: { clientId: "p1" }, proposedStops: [], resolvedStops: {} } as never;
    expect(await confirmProposal("trip-1", request, "fork-1")).toEqual({ success: true, createdId: "t-new", createdStops: {} });
    expect(m.confirm).toHaveBeenCalledWith("trip-1", `u${user}`, request, "fork-1");
    expectAccessCheckedBeforeWrite(m.requirePlanAccess, m.confirm);
  });
});
