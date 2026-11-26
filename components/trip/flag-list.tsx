/**
 * Presentational component for trip flags.
 *
 * Groups flags by severity (warnings first, then info), renders each
 * with an appropriate icon + color, and links to the relevant page
 * where possible.
 */

import type { Route } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { flagDisplayMessage, canMarkFine, type Flag } from "@/lib/flags";
import { flagHref } from "@/lib/next-steps";
import { tripSubPath } from "@/lib/trip-path";
import { MarkFineButton } from "@/components/trip/marked-fine";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FlagListProps {
  flags: Flag[];
  tripId: string;
  /** Base path for this trip, e.g. "/trips/abc123". Used to build deep links. */
  tripBasePath: Route;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  warning: {
    containerClass: "bg-warning/10 border-warning/40",
    iconClass: "text-sun-text",
    labelClass: "text-sun-text",
    icon: AlertTriangle,
    label: "Warning",
  },
  info: {
    containerClass: "bg-hue-sky/25 border-border",
    // Not text-hue-sky-text: that token is tuned for text on paper/card, and
    // on a tint of the same hue (containerClass, above) it fails contrast in
    // dark mode — same root cause as the hue-ramp's soft+text composition
    // (see lib/hues.ts's HueClasses.onSoft).
    iconClass: "text-foreground",
    labelClass: "text-foreground",
    icon: Info,
    label: "Info",
  },
} as const;

// ---------------------------------------------------------------------------
// Link builder
// ---------------------------------------------------------------------------

function buildLink(flag: Flag, basePath: Route): Route | null {
  switch (flag.targetType) {
    case "STOP":
    case "TRANSPORT":
    case "ACCOMMODATION":
    case "ITEM":
      // Spec 2026-10-06 §F: land on the Stop (or the missing leg's form), not the Home. An Item Flag opens its day (spec 2026-10-17 R7).
      return flagHref(flag, basePath);
    case "DAY":
      if (flag.date) {
        return tripSubPath(basePath, `/day/${flag.date}`);
      }
      return null;
    case "TRIP":
      return basePath;
    default: {
      // Exhaustive: a new FlagTargetType fails to compile here until it has a link.
      const unhandled: never = flag.targetType;
      return unhandled;
    }
  }
}

// ---------------------------------------------------------------------------
// Single flag row
// ---------------------------------------------------------------------------

const ROW_CONTAINER = "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-colors";

function FlagRow({ flag, tripId, tripBasePath }: { flag: Flag; tripId: string; tripBasePath: Route }) {
  const config = SEVERITY_CONFIG[flag.severity];
  const Icon = config.icon;
  const link = buildLink(flag, tripBasePath);
  const icon = <Icon className={cn("mt-0.5 size-4 shrink-0", config.iconClass)} aria-hidden="true" />;
  const message = flagDisplayMessage(flag);

  if (canMarkFine(flag)) {
    const text = cn("leading-snug", config.labelClass);
    return (
      <div className={cn(ROW_CONTAINER, config.containerClass)}>
        {icon}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          {link ? (
            <Link href={link} className={cn(text, "hover:underline")}>
              {message}
            </Link>
          ) : (
            <span className={text}>{message}</span>
          )}
          <MarkFineButton tripId={tripId} target={{ flagId: flag.id, fingerprint: flag.fingerprint, between: flag.between }} />
        </div>
      </div>
    );
  }

  const content = (
    <div className={cn(ROW_CONTAINER, config.containerClass, link && "hover:opacity-80")}>
      {icon}
      <span className={cn("leading-snug", config.labelClass)}>{message}</span>
    </div>
  );
  return link ? (
    <Link href={link} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const EMPTY_DAY_PREFIX = "empty-day-";

function FlagSection({
  title,
  flags,
  tripId,
  tripBasePath,
}: {
  title: string;
  flags: Flag[];
  tripId: string;
  tripBasePath: Route;
}) {
  if (flags.length === 0) return null;
  const emptyDays = flags.filter((f) => f.id.startsWith(EMPTY_DAY_PREFIX));
  const fold = emptyDays.length >= 2;
  const config = SEVERITY_CONFIG.info;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({flags.length})
      </h3>
      <ul className="flex flex-col gap-2" role="list">
        {flags.map((flag) => {
          if (fold && flag.id.startsWith(EMPTY_DAY_PREFIX)) {
            if (flag.id !== emptyDays[0].id) return null;
            return (
              <li key="empty-days">
                <details className="group">
                  <summary className={cn(ROW_CONTAINER, config.containerClass, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                    <Info className={cn("mt-0.5 size-4 shrink-0", config.iconClass)} aria-hidden="true" />
                    <span className={cn("min-w-0 flex-1 leading-snug", config.labelClass)}>
                      Nothing scheduled on {emptyDays.length} days
                    </span>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2" role="list">
                    {emptyDays.map((f) => (
                      <li key={f.id}>
                        <FlagRow flag={f} tripId={tripId} tripBasePath={tripBasePath} />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          }
          return (
            <li key={flag.id}>
              <FlagRow flag={flag} tripId={tripId} tripBasePath={tripBasePath} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FlagList
// ---------------------------------------------------------------------------

export function FlagList({ flags, tripId, tripBasePath }: FlagListProps) {
  const warnings = flags.filter((f) => f.severity === "warning");
  const infos = flags.filter((f) => f.severity === "info");

  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800/50 dark:bg-green-950/20">
        <CheckCircle2
          className="size-5 shrink-0 text-green-600 dark:text-green-400"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          No issues spotted. Looks like a well-planned trip!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <FlagSection
        title="Warnings"
        flags={warnings}
        tripId={tripId}
        tripBasePath={tripBasePath}
      />
      <FlagSection
        title="Notes"
        flags={infos}
        tripId={tripId}
        tripBasePath={tripBasePath}
      />
    </div>
  );
}
