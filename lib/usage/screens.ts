import { TRIP_SCREENS, type UsageScreen } from "@/lib/usage/lists";

const APP_PATHS: Record<string, UsageScreen> = {
  "/trips": "trips",
  "/trips/new": "new-trip",
  "/account": "account",
  "/help": "help",
  "/admin": "admin",
  "/whats-new": "whats-new",
};

const TRIP_SEGMENTS: Record<string, UsageScreen> = {
  plan: "plan",
  day: "day",
  budget: "money",
  calendar: "calendar",
  checklists: "checklists",
  files: "files",
  activity: "activity",
  summary: "summary",
  print: "print",
  reviews: "reviews",
  wishlist: "wishlist",
  journal: "journal",
  settings: "settings",
  help: "trip-help",
  more: "more",
};

export function screenForPath(pathname: string): UsageScreen | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/globe" || path.startsWith("/globe/")) return "globe";
  if (Object.hasOwn(APP_PATHS, path)) return APP_PATHS[path];
  const segments = path.split("/");
  if (segments[1] !== "trips" || !segments[2] || segments[2] === "new") return null;
  if (segments.length === 3) return "trip-home";
  const screen = Object.hasOwn(TRIP_SEGMENTS, segments[3]) ? TRIP_SEGMENTS[segments[3]] : null;
  if (!screen) return null;
  return segments.length <= (screen === "day" ? 5 : 4) ? screen : null;
}

export function isTripScreen(screen: UsageScreen): boolean {
  return (TRIP_SCREENS as readonly string[]).includes(screen);
}
