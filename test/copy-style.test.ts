import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { copyScanFiles, scanSource } from "./helpers/copy-scan";

/** Spec 2026-10-08 §K. Each entry needs a reason a reviewer would accept. */
const ALLOWLIST: { file: string; includes: string; reason: string }[] = [];

/** Files not yet brought to the house style (spec §F). Tasks remove their files; the list must end empty and be deleted. */
const PENDING = new Set<string>([
  "app/(app)/layout.tsx",
  "app/(app)/trips/[tripId]/files/page.tsx",
  "app/(app)/trips/[tripId]/journal/page.tsx",
  "app/(app)/trips/[tripId]/print/page.tsx",
  "app/global-error.tsx",
  "app/opengraph-image.tsx",
  "components/account/dispatcher-health.tsx",
  "components/account/profile-card.tsx",
  "components/account/profile-photo-focal.tsx",
  "components/account/traveller-details-card.tsx",
  "components/account/trip-digests-panel.tsx",
  "components/globe/globe-invite-button.tsx",
  "components/globe/marker-form.tsx",
  "components/money/cost-tile.tsx",
  "components/new-trip/flow-top-bar.tsx",
  "components/new-trip/new-trip-flow.tsx",
  "components/new-trip/preview-model.ts",
  "components/offline-banner.tsx",
  "components/plan/home-base-bookend.tsx",
  "components/plan/stop-row.tsx",
  "components/shell/sidebar.tsx",
  "components/shell/trip-switcher.tsx",
  "components/trip/accommodation-form-dialog.tsx",
  "components/trip/activity-feed.tsx",
  "components/trip/ai-activity-suggestions.tsx",
  "components/trip/ai-booking-parser.tsx",
  "components/trip/ai-packing-suggestions.tsx",
  "components/trip/chapters-manager.tsx",
  "components/trip/checklist.tsx",
  "components/trip/day-ideas.tsx",
  "components/trip/duplicate-trip-dialog.tsx",
  "components/trip/flag-list.tsx",
  "components/trip/home/next-steps-card.tsx",
  "components/trip/home/phase-travelling.tsx",
  "components/trip/inline-cost-fields.tsx",
  "components/trip/item-form-dialog.tsx",
  "components/trip/itinerary-manager.tsx",
  "components/trip/journal-editor.tsx",
  "components/trip/location-combobox.tsx",
  "components/trip/make-it-fit.tsx",
  "components/trip/note-thread.tsx",
  "components/trip/other-cost-editor.tsx",
  "components/trip/packing-templates-bar.tsx",
  "components/trip/rates-panel.tsx",
  "components/trip/schedule-item-dialog.tsx",
  "components/trip/settings/calendar-feed-panel.tsx",
  "components/trip/settings/cover-image-field.tsx",
  "components/trip/settings/digest-panel.tsx",
  "components/trip/settings/driving-estimates-panel.tsx",
  "components/trip/settings/invite-panel.tsx",
  "components/trip/settings/share-links-panel.tsx",
  "components/trip/settings/traveller-details-list.tsx",
  "components/trip/settings/trip-details-form.tsx",
  "components/trip/stop-deletion-preview.tsx",
  "components/trip/timeline.tsx",
  "components/trip/transport-form-dialog.tsx",
  "components/trip/vote-control.tsx",
  "components/trip/wishlist-board.tsx",
  "components/trips/travels-map-card.tsx",
  "components/ui/action-failure.ts",
  "components/ui/error-panel.tsx",
  "lib/release-notes.ts",
  "server/actions/ai.ts",
  "server/actions/attachments.ts",
  "server/actions/chapters.ts",
  "server/actions/cover.ts",
  "server/actions/digest.ts",
  "server/actions/globe.ts",
  "server/actions/push.ts",
  "server/actions/share.ts",
  "server/actions/stops.ts",
  "server/actions/trips.ts",
]);

const root = path.resolve(__dirname, "..");
const violations = copyScanFiles(root)
  .flatMap((f) => scanSource(f, fs.readFileSync(path.join(root, f), "utf8")))
  .filter((v) => !ALLOWLIST.some((a) => a.file === v.file && v.text.includes(a.includes)));

it("Traveller-facing copy has no em-dashes, 'Failed to' or 'Please try again'", () => {
  const live = violations.filter((v) => !PENDING.has(v.file));
  expect(live.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`)).toEqual([]);
});

it("every pending file still has something to fix (remove clean files from PENDING)", () => {
  const dirty = new Set(violations.map((v) => v.file));
  expect([...PENDING].filter((f) => !dirty.has(f))).toEqual([]);
});
