import type { UsageAction, UsageDetail, UsageScreen } from "./lists";

export const SCREEN_LABELS: Record<UsageScreen, string> = {
  trips: "Trips",
  globe: "Globe",
  account: "Account",
  help: "Help",
  admin: "Admin",
  "new-trip": "New trip",
  "whats-new": "What’s new",
  "trip-home": "Trip home",
  plan: "Plan",
  day: "Day view",
  money: "Money",
  calendar: "Calendar",
  checklists: "Checklists",
  files: "Files",
  activity: "Activity",
  summary: "Summary",
  print: "Print",
  reviews: "Reviews",
  wishlist: "Wishlist",
  journal: "Journal",
  settings: "Settings",
  "trip-help": "Trip help",
  more: "More",
};

const MORE_ROW_LABELS: Partial<Record<UsageDetail, string>> = {
  calendar: "Calendar",
  summary: "Summary",
  reviews: "Reviews",
  wishlist: "Wishlist",
  journal: "Journal",
  checklists: "Checklists",
  files: "Files",
  activity: "Activity",
  settings: "Settings",
  help: "Help",
  share: "Share",
};

const REVIEW_KIND_LABELS: Partial<Record<UsageDetail, string>> = { standard: "Standard", deep: "Deep" };

export function actionLabel(action: UsageAction, detail: UsageDetail | null): string {
  switch (action) {
    case "day-changed":
      return detail ? `Changed day by ${detail}` : "Changed day";
    case "day-map-opened":
      return "Opened the Day map";
    case "directions-tapped":
      return "Tapped Directions";
    case "directions-back-tapped":
      return "Tapped Directions back";
    case "attachment-opened":
      return "Opened an Attachment";
    case "weather-detail-opened":
      return "Opened the weather detail";
    case "reminder-got-it":
      return "Tapped Got it";
    case "search-opened":
      return "Opened search";
    case "more-opened":
      return "Opened More";
    case "more-row-chosen": {
      const row = detail ? MORE_ROW_LABELS[detail] : undefined;
      return row ? `Chose ${row} from More` : "Chose a row from More";
    }
    case "add-to-day-opened":
      return "Opened Add to this day";
    case "booking-import-started":
      return "Started a Booking import";
    case "review-started": {
      const kind = detail ? REVIEW_KIND_LABELS[detail] : undefined;
      return kind ? `Started a ${kind} Review` : "Started a Review";
    }
    case "share-link-opened":
      return "Opened a Share link";
  }
}

export function formatMicroUsd(micro: number): string {
  return `US$${(micro / 1_000_000).toFixed(2)}`;
}
