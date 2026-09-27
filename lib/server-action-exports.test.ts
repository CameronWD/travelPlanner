import { describe, expect, it, vi } from "vitest";

/**
 * Repo guard (fix round 2, security): every export of a "use server" module
 * becomes a callable Server Action with its own action id — client-callable
 * regardless of whether any client code imports it. Fix rounds 1 and 2 of
 * Task 8 each found a helper that got exported alongside the genuine,
 * access-checked actions in one of these modules purely so a sibling
 * action/action-module could reuse it (`copyItemPhoto`,
 * `createAttachmentFromFile`, `loadJournalWindow`) — each did NO auth of its
 * own, trusting an already-access-checked caller, which is exactly the
 * shape of bug this test exists to catch before it ships again.
 *
 * This pins each listed module's exported FUNCTION names to an explicit
 * allowlist (types/interfaces are erased at compile time and never reach
 * the client as Server Actions regardless, so they're not the concern
 * here — only runtime function bindings are). Adding a new helper export to
 * one of these files — instead of a plain `lib/` module — fails this test
 * loudly, rather than silently shipping a new client-callable endpoint.
 *
 * Mocks every dependency of every listed module so importing them here has
 * no side effects (no real db/storage/etc. calls) — this test only cares
 * about the shape of each module's export surface, not its behaviour.
 */

vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => vi.fn() }) }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(),
  requireForkAccess: vi.fn(),
}));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn(), getUserGlobe: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  getStorage: vi.fn(),
  generateKey: vi.fn(),
  validateUpload: vi.fn(),
  sanitiseFilename: vi.fn(),
}));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/journal-window", () => ({
  canWriteJournal: vi.fn(),
  journalWritableDates: vi.fn(),
  JOURNAL_NOTE_MAX: 500,
}));
vi.mock("@/lib/journal-window-loader", () => ({ loadJournalWindow: vi.fn() }));
vi.mock("@/lib/item-photo-copy", () => ({ copyItemPhoto: vi.fn() }));
vi.mock("@/lib/attachment-create", () => ({ createAttachmentFromFile: vi.fn() }));
vi.mock("@/lib/validations/journal", () => ({
  saveJournalEntrySchema: { safeParse: vi.fn() },
  journalBodyExceedsLimit: vi.fn(),
}));
vi.mock("@/server/actions/activity", () => ({
  recordActivity: vi.fn(),
  recordPlanActivity: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Only runtime (function) bindings count — `export type`/`export interface` are erased at compile time. */
function exportedFunctionNames(mod: Record<string, unknown>): string[] {
  return Object.keys(mod)
    .filter((key) => typeof mod[key] === "function")
    .sort();
}

describe("server/actions/*.ts export surface (repo guard)", () => {
  it("attachments.ts exports only uploadAttachment, deleteAttachment", async () => {
    const mod = await import("@/server/actions/attachments");
    expect(exportedFunctionNames(mod)).toEqual(["deleteAttachment", "uploadAttachment"]);
  });

  it("journal.ts exports only saveJournalEntry, deleteJournalEntry, setJournalShareHidden", async () => {
    const mod = await import("@/server/actions/journal");
    expect(exportedFunctionNames(mod)).toEqual([
      "deleteJournalEntry",
      "saveJournalEntry",
      "setJournalShareHidden",
    ]);
  });

  it("item-photo.ts exports only setItemPhoto, removeItemPhoto", async () => {
    const mod = await import("@/server/actions/item-photo");
    expect(exportedFunctionNames(mod)).toEqual(["removeItemPhoto", "setItemPhoto"]);
  });

  it("day-titles.ts exports only setDayTitle", async () => {
    const mod = await import("@/server/actions/day-titles");
    expect(exportedFunctionNames(mod)).toEqual(["setDayTitle"]);
  });

  it("profile.ts exports only setDisplayName, setProfilePhoto, removeProfilePhoto", async () => {
    const mod = await import("@/server/actions/profile");
    expect(exportedFunctionNames(mod)).toEqual([
      "removeProfilePhoto",
      "setDisplayName",
      "setProfilePhoto",
    ]);
  });
});
