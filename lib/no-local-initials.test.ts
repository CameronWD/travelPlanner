import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Task 2 ("One TravellerAvatar everywhere"): every surface below used to
 * carry its own copy of `function initials(name) { ... }` next to its own
 * `Avatar` markup — the exact drift that let the Journal page's author
 * photo go unwired for so long. This is a repo guard, not a UI test: it
 * reads each migrated file's source with `fs` and fails if a local
 * `initials()` helper creeps back in, so a future edit can't silently
 * reintroduce a second source of truth alongside `lib/traveller.ts`.
 */
const MIGRATED_FILES = [
  "app/(app)/layout.tsx",
  "app/(app)/trips/[tripId]/layout.tsx",
  "app/(app)/trips/[tripId]/journal/page.tsx",
  "app/(app)/admin/access-requests.tsx",
  "components/trip/vote-control.tsx",
  "components/trip/notification-bell.tsx",
  "components/trip/journal-entry-view.tsx",
  "components/trip/note-thread.tsx",
  "components/trip/checklist.tsx",
  "components/trip/settings/invite-panel.tsx",
  "components/account/profile-card.tsx",
];

describe("no local initials() helpers on migrated Traveller-avatar surfaces", () => {
  for (const relPath of MIGRATED_FILES) {
    it(`${relPath} does not define its own initials()`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
      expect(source).not.toMatch(/function initials\(/);
    });
  }
});
