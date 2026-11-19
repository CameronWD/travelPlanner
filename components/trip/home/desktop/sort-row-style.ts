import type { LucideIcon } from "lucide-react";
import { Bell, Calendar, Check, CircleAlert, ClipboardList, ListChecks, MapPin, Plane } from "lucide-react";
import type { SortIcon, SortTone } from "@/lib/sort-these-out";

export const ICONS: Record<SortIcon, LucideIcon> = {
  bell: Bell,
  plane: Plane,
  "list-checks": ListChecks,
  "clipboard-list": ClipboardList,
  calendar: Calendar,
  "circle-alert": CircleAlert,
  "map-pin": MapPin,
  check: Check,
};

// Written out in full so Tailwind's scanner sees each class.
export const TONES: Record<SortTone, string> = {
  coral: "bg-coral",
  sun: "bg-sun",
  teal: "bg-teal",
  lilac: "bg-lilac",
  pink: "bg-hue-pink",
  stone: "bg-hue-stone",
};
