export const APP_SCREENS = ["trips", "globe", "account", "help", "admin", "new-trip", "whats-new"] as const;
export const TRIP_SCREENS = [
  "trip-home",
  "plan",
  "day",
  "money",
  "calendar",
  "checklists",
  "files",
  "activity",
  "summary",
  "print",
  "reviews",
  "wishlist",
  "journal",
  "settings",
  "trip-help",
  "more",
] as const;
export const USAGE_SCREENS = [...APP_SCREENS, ...TRIP_SCREENS] as const;
export const USAGE_ACTIONS = [
  "day-changed",
  "day-map-opened",
  "directions-tapped",
  "attachment-opened",
  "weather-detail-opened",
  "reminder-got-it",
  "search-opened",
  "more-opened",
  "more-row-chosen",
  "add-to-day-opened",
  "booking-import-started",
  "review-started",
  "share-link-opened",
] as const;
export const DAY_CHANGE_METHODS = ["swipe", "arrow", "chip", "keyboard"] as const;
export const MORE_ROWS = [
  "calendar",
  "summary",
  "reviews",
  "wishlist",
  "journal",
  "checklists",
  "files",
  "activity",
  "settings",
  "help",
  "share",
] as const;
export const REVIEW_KINDS = ["standard", "deep"] as const;
export const ACTION_DETAILS = {
  "day-changed": DAY_CHANGE_METHODS,
  "more-row-chosen": MORE_ROWS,
  "review-started": REVIEW_KINDS,
} as const;
export const USAGE_DETAILS = [...DAY_CHANGE_METHODS, ...MORE_ROWS, ...REVIEW_KINDS] as const;
export const USAGE_PHASES = ["sketching", "planning", "final-prep", "travelling", "past"] as const;
export const OPEN_MODES = ["phone-app", "phone-browser", "desktop"] as const;
export const USAGE_SITES = ["main", "beta", "preview", "local"] as const;

export type AppScreen = (typeof APP_SCREENS)[number];
export type TripScreen = (typeof TRIP_SCREENS)[number];
export type UsageScreen = (typeof USAGE_SCREENS)[number];
export type UsageAction = (typeof USAGE_ACTIONS)[number];
export type DayChangeMethod = (typeof DAY_CHANGE_METHODS)[number];
export type MoreRow = (typeof MORE_ROWS)[number];
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type UsageDetail = (typeof USAGE_DETAILS)[number];
export type UsagePhase = (typeof USAGE_PHASES)[number];
export type OpenMode = (typeof OPEN_MODES)[number];
export type UsageSite = (typeof USAGE_SITES)[number];

export const MORE_ROW_BY_LABEL: Record<string, MoreRow> = {
  Calendar: "calendar",
  Summary: "summary",
  Reviews: "reviews",
  Wishlist: "wishlist",
  Journal: "journal",
  Checklists: "checklists",
  Files: "files",
  Activity: "activity",
  Settings: "settings",
  Help: "help",
  Share: "share",
};

export const MAX_QUEUE = 500;
export const MAX_BATCH_RECORDS = 100;
export const MAX_BODY_BYTES = 32_768;
export const MAX_APPEAR_MS = 120_000;
export const MAX_DAY_OFFSET = 1000;
export const MAX_ID_CHARS = 64;
export const RETENTION_DAYS = 180;
export const FUTURE_SKEW_MS = 5 * 60_000;

export type ScreenWire = {
  screen: UsageScreen;
  at: number;
  mode: OpenMode;
  tripId?: string;
  phase?: UsagePhase;
  ms?: number;
  saved?: boolean;
  dayOffset?: number;
};
export type ActionWire = {
  action: UsageAction;
  at: number;
  mode: OpenMode;
  detail?: UsageDetail;
  tripId?: string;
  phase?: UsagePhase;
  dayOffset?: number;
};
export type UsageWireRecord = ScreenWire | ActionWire;
