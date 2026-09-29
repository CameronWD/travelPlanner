import {
  Activity, BookOpen, Calendar, CalendarDays, CircleHelp, FileText, Heart, Home, ListChecks,
  Map, Menu, Paperclip, Settings, Wallet, type LucideIcon,
} from "lucide-react";

export type NavLabel =
  | "Home" | "Plan" | "Days" | "Calendar" | "Money" | "Wishlist" | "Summary"
  | "Journal" | "Checklists" | "Files" | "Activity" | "Settings" | "Help" | "More";

/**
 * One icon per Trip section, shared by the desktop sidebar, the phone tab bar
 * and the help legend, so the same section looks the same on every device
 * (Feedback cmumd26ny000104jywgykrva2). No React here: importable from
 * server and client components alike.
 */
export const NAV_ICONS: Record<NavLabel, LucideIcon> = {
  Home, Plan: Map, Days: CalendarDays, Calendar, Money: Wallet, Wishlist: Heart, Summary: FileText,
  Journal: BookOpen, Checklists: ListChecks, Files: Paperclip, Activity, Settings, Help: CircleHelp, More: Menu,
};
