import { revalidatePath } from "next/cache";

/**
 * Every write's cache invalidation (spec 2026-10-14 card 2.E, decision Q6;
 * ADR 0064 amendment 2026-10-15). Actions name what they wrote — a scope —
 * and this module owns which pages that touches. Paths are the id path the
 * proxy rewrites a slug URL to (ADR 0064), never `tripPath()`.
 *
 * Layout-wide only for `trip` and `travellers` (NAV-02): they change the
 * shell (name, cover, dials, who's going). Everything else names its pages.
 */
export type TripScope = "plan" | "money" | "lists" | "journal" | "travellers" | "trip" | "reviews";

export type TripPage =
  | "" | "/plan" | "/budget" | "/calendar" | "/summary" | "/print" | "/compare"
  | "/day" | "/journal" | "/checklists" | "/wishlist" | "/files" | "/settings" | "/reviews";

/** "/day" stands for every day page: revalidated through the route pattern. */
const DAY_ROUTE = "/trips/[tripId]/day/[date]";

export const SCOPE_PAGES: Record<TripScope, readonly TripPage[] | "layout"> = {
  plan: ["", "/plan", "/budget", "/calendar", "/summary", "/print", "/compare", "/day", "/wishlist", "/files", "/checklists", "/settings"],
  money: ["", "/plan", "/budget", "/calendar", "/summary", "/print", "/compare", "/day", "/wishlist"],
  lists: ["", "/checklists"],
  journal: ["", "/plan", "/day", "/journal", "/wishlist", "/files"],
  travellers: "layout",
  trip: "layout",
  // Spec 2026-10-17 R10: Findings change state on the Reviews tab; Home shows "N open from the <date> review".
  reviews: ["", "/reviews"],
};

/** The tables each scope's writers write. Read by the coverage test. */
export const SCOPE_TABLES: Record<TripScope, readonly string[]> = {
  plan: ["stop", "item", "transport", "accommodation", "chapter", "dayTitle", "fork", "note", "vote", "reminder"],
  money: ["cost", "exchangeRate"],
  lists: ["checklistItem", "packingTemplate"],
  journal: ["journalEntry", "attachment"],
  travellers: ["tripMember", "invite"],
  trip: ["trip", "shareLink", "calendarFeed", "digest"],
  reviews: ["review", "finding"],
};

export function revalidateTrip(tripId: string, ...scopes: [TripScope, ...TripScope[]]): void {
  const base = `/trips/${tripId}`;
  if (scopes.some((s) => SCOPE_PAGES[s] === "layout")) {
    revalidatePath(base, "layout");
    if (scopes.includes("trip")) revalidatePath("/trips");
    return;
  }
  const pages = new Set<TripPage>();
  for (const s of scopes) for (const p of SCOPE_PAGES[s] as readonly TripPage[]) pages.add(p);
  for (const p of pages) {
    if (p === "/day") revalidatePath(DAY_ROUTE, "page");
    else revalidatePath(`${base}${p}`);
  }
}

/** The /trips list (trip cards, reminders on them, release-note banner). */
export function revalidateTripsList(): void {
  revalidatePath("/trips");
}

/**
 * Every Trip's Home (dynamic-segment form — not a scoped TripScope: nothing
 * else needs every Trip's Home revalidated in one call, only dismissWhatsNew
 * (server/actions/release-notes.ts), which carries no tripId to scope to).
 */
export function revalidateAllTripHomes(): void {
  revalidatePath("/trips/[tripId]", "page");
}

/** Profile name/photo appear in every layout. */
export function revalidateAccount(): void {
  revalidatePath("/", "layout");
}

export function revalidateAccountPage(): void {
  revalidatePath("/account");
}

export function revalidateGlobe(): void {
  revalidatePath("/globe");
}

export function revalidateAdmin(): void {
  revalidatePath("/admin");
}
