import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Repo guard (fix round 2, security; widened by final review #8): every
 * export of a "use server" module becomes a callable Server Action with its
 * own action id — client-callable regardless of whether any client code
 * imports it. Fix rounds 1 and 2 of Task 8 each found a helper exported
 * alongside the genuine, access-checked actions purely so a sibling module
 * could reuse it (`copyItemPhoto`, `createAttachmentFromFile`,
 * `loadJournalWindow`) — each did NO auth of its own.
 *
 * This walks EVERY `server/actions/*.ts` whose first statement is the
 * "use server" directive and, by static analysis (TypeScript's parser — no
 * module is imported, so nothing needs mocking and no side effect runs):
 *
 * 1. asserts each runtime export is an `export async function` (Next.js
 *    only allows async functions from a "use server" file; a `const`, a
 *    class, a sync function, `export default` or an `export { … }` list is
 *    refused here), and
 * 2. pins each file's exported function names to the explicit allowlist
 *    below. Adding an export — or a new "use server" file — fails loudly
 *    until it's added here, which is the moment to check it does its own
 *    access check (and isn't a helper that belongs in a plain `lib/`
 *    module).
 *
 * `export type` / `export interface` are erased at compile time and never
 * reach the client, so they're ignored.
 */
const ALLOWLIST: Record<string, string[]> = {
  "access-requests.ts": [
    "approveAccessRequest",
    "dismissAccessRequest",
    "listAccessRequests",
    "listAllowedEmails",
    "revokeAllowedEmail",
  ],
  "accommodation.ts": ["createAccommodation", "deleteAccommodation", "updateAccommodation"],
  "activity.ts": ["getRecentActivity", "getUnreadActivityCount", "markAllRead", "recordActivity"],
  "ai.ts": ["aiDraftPackingList", "aiParseBooking", "aiSuggestActivities"],
  "attachments.ts": ["deleteAttachment", "uploadAttachment"],
  "calendar-feed.ts": [
    "createCalendarFeed",
    "getCalendarFeed",
    "revokeCalendarFeed",
    "rotateCalendarFeed",
    "updateCalendarFeedAlarms",
    "updateCalendarFeedFilter",
  ],
  "chapters.ts": [
    "assignStopToChapter",
    "createChapter",
    "deleteChapter",
    "reorderChapters",
    "suggestChaptersFromCountries",
    "updateChapter",
  ],
  "checklists.ts": [
    "addChecklistItem",
    "applyTemplate",
    "deleteChecklistItem",
    "deleteTemplate",
    "listTemplates",
    "reorderChecklistItem",
    "saveAsTemplate",
    "toggleChecklistItem",
    "updateChecklistItem",
  ],
  "costs.ts": ["createCost", "deleteCost", "markCostPaid", "markCostUnpaid", "updateCost"],
  "cover.ts": ["removeTripCover", "setCoverFocal", "setTripCover"],
  "cron-health.ts": ["getDispatcherHealth"],
  "day-titles.ts": ["setDayTitle"],
  "devices.ts": ["listDevices", "reconcileDevice", "removeDeviceById"],
  "digest.ts": ["getDigestSettings", "listDigestSettingsForUser", "sendTestDigest", "setDigestEnabled"],
  "driving-settings.ts": ["updateDrivingSettings"],
  "error-reports.ts": ["clearAllErrorReports", "clearErrorReport", "listErrorReports"],
  "feedback.ts": ["createFeedbackNote", "deleteFeedbackNote", "listFeedbackNotes"],
  "forks.ts": [
    "createFork",
    "discardFork",
    "getComparison",
    "getPromotionPreview",
    "listForks",
    "moveFork",
    "promoteFork",
    "renameFork",
  ],
  "globe.ts": [
    "createMarker",
    "deleteMarker",
    "inviteToGlobe",
    "reverseGeocodeAction",
    "searchPlacesAction",
    "updateMarker",
  ],
  "invites.ts": ["cancelInvite", "inviteToTrip"],
  "item-photo.ts": ["removeItemPhoto", "setItemPhoto"],
  "items.ts": [
    "addMarkerToWishlist",
    "createItem",
    "deleteItem",
    "rescheduleItem",
    "scheduleItem",
    "unscheduleItem",
    "updateItem",
  ],
  "journal.ts": ["deleteJournalEntry", "saveJournalEntry", "setJournalShareHidden"],
  "last-trip.ts": ["rememberLastTrip"],
  "notes.ts": ["addNote", "deleteNote"],
  "places.ts": ["findPlaces"],
  "profile.ts": ["removeProfilePhoto", "setDisplayName", "setProfilePhoto", "setProfilePhotoFocal"],
  "push.ts": ["healRotatedSubscription", "subscribeToPush", "unsubscribeFromPush"],
  "rates.ts": ["clearManualRate", "refreshRates", "setManualRate"],
  "release-notes.ts": ["dismissWhatsNew"],
  "reminders.ts": ["addReminder", "deleteReminder", "listRemindersForTrip", "updateReminder"],
  "search.ts": ["listMyTrips", "searchTrip"],
  "share.ts": ["createShareLink", "listShareLinks", "revokeShareLink", "rotateShareLink", "updateShareLink"],
  "stops.ts": [
    "assignStopToChapter",
    "createStop",
    "deleteStop",
    "firmUpSegment",
    "firmUpTrip",
    "getTripProjection",
    "makeStopRough",
    "moveStop",
    "previewStopDeletion",
    "reorderStops",
    "restoreStops",
    "setStopDates",
    "setStopNights",
    "setStopNotes",
    "toggleStopPin",
    "updateStop",
  ],
  "transport.ts": [
    "createTransport",
    "deleteTransport",
    "reorderTransports",
    "searchPlacesAction",
    "updateTransport",
  ],
  "trips.ts": [
    "createTrip",
    "deleteTrip",
    "duplicateTrip",
    "leaveTrip",
    "removeTripMember",
    "setChaptersEnabled",
    "setForksEnabled",
    "setTripHardEndDate",
    "updateTrip",
  ],
  "votes.ts": ["clearVote", "setVote"],
  "welcome.ts": ["markWelcomeSeen"],
};

const ACTIONS_DIR = path.resolve(__dirname, "../server/actions");

interface ExportSurface {
  asyncFunctions: string[];
  /** Runtime exports that are NOT `export async function` — each is a bug. */
  violations: string[];
}

function isUseServerModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []).some((m) => m.kind === kind) : false;
}

function exportSurface(source: ts.SourceFile): ExportSurface {
  const asyncFunctions: string[] = [];
  const violations: string[] = [];
  for (const st of source.statements) {
    // `export type { X }` is erased; any other `export { … }` / `export … from`
    // / `export default` / `export =` is a runtime export we can't vouch for.
    if (ts.isExportDeclaration(st)) {
      if (!st.isTypeOnly) violations.push(st.getText(source));
      continue;
    }
    if (ts.isExportAssignment(st)) {
      violations.push(st.getText(source));
      continue;
    }
    if (!hasModifier(st, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) continue;
    if (
      ts.isFunctionDeclaration(st) &&
      st.name &&
      hasModifier(st, ts.SyntaxKind.AsyncKeyword) &&
      !hasModifier(st, ts.SyntaxKind.DefaultKeyword)
    ) {
      asyncFunctions.push(st.name.text);
      continue;
    }
    violations.push(st.getText(source).split("\n")[0]);
  }
  return { asyncFunctions: asyncFunctions.sort(), violations };
}

const useServerFiles = fs
  .readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .sort()
  .map((file) => {
    const text = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    return { file, source: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) };
  })
  .filter(({ source }) => isUseServerModule(source));

describe("server/actions/*.ts export surface (repo guard)", () => {
  it("finds the \"use server\" modules (sanity: the walk isn't silently empty)", () => {
    expect(useServerFiles.length).toBeGreaterThanOrEqual(Object.keys(ALLOWLIST).length);
  });

  it("lists every \"use server\" module in the allowlist, and no stale ones", () => {
    expect(useServerFiles.map((f) => f.file)).toEqual(Object.keys(ALLOWLIST).sort());
  });

  it.each(useServerFiles.map(({ file, source }) => [file, source] as const))(
    "%s exports only allowlisted async functions",
    (file, source) => {
      const { asyncFunctions, violations } = exportSurface(source);
      expect(violations, `${file}: every runtime export of a "use server" module must be an async function`).toEqual([]);
      expect(asyncFunctions).toEqual([...(ALLOWLIST[file] ?? [])].sort());
    },
  );
});

describe("exportSurface (the guard's own parser)", () => {
  const parse = (code: string) =>
    exportSurface(ts.createSourceFile("x.ts", `"use server";\n${code}`, ts.ScriptTarget.Latest, true));

  it("accepts async functions and ignores types", () => {
    expect(
      parse("export async function a() {}\nexport type T = 1;\nexport interface I {}\nexport type { T as U };"),
    ).toEqual({ asyncFunctions: ["a"], violations: [] });
  });

  it("flags sync functions, consts, classes, re-exports and defaults", () => {
    const { asyncFunctions, violations } = parse(
      [
        "export function helper() {}",
        "export const x = async () => {};",
        "export class C {}",
        "export { helper as h };",
        "export default async function d() {}",
      ].join("\n"),
    );
    expect(asyncFunctions).toEqual([]);
    expect(violations).toHaveLength(5);
  });
});
