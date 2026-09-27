import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Task 2 ("One TravellerAvatar everywhere"): every surface below used to
 * carry its own copy of an `initials()` helper — either a `function
 * initials(name) { ... }` declaration or a `const initials = ...` inline
 * computation (components/trip/activity-feed.tsx's shape) — next to its own
 * `Avatar` markup. That drift is exactly what let the Journal page's author
 * photo, and the Activity feed's, go unwired for so long. This is a repo
 * guard, not a UI test: it reads each migrated file's source with `fs` and
 * fails if a local `initials` helper creeps back in, so a future edit can't
 * silently reintroduce a second source of truth alongside `lib/traveller.ts`.
 */
const MIGRATED_FILES = [
  "app/(app)/layout.tsx",
  "app/(app)/trips/[tripId]/layout.tsx",
  "app/(app)/trips/[tripId]/journal/page.tsx",
  "app/(app)/admin/access-requests.tsx",
  "components/trip/activity-feed.tsx",
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
      expect(source).not.toMatch(/function initials\(|const initials\s*=/);
    });
  }
});
