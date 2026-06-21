/**
 * Presentational component for trip flags.
 *
 * Groups flags by severity (warnings first, then info), renders each
 * with an appropriate icon + color, and links to the relevant page
 * where possible.
 */

import Link from "next/link";
import {
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Flag } from "@/lib/flags";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FlagListProps {
  flags: Flag[];
  /** Base path for this trip, e.g. "/trips/abc123". Used to build deep links. */
  tripBasePath: string;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  warning: {
    containerClass:
      "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50",
    iconClass: "text-amber-600 dark:text-amber-400",
    labelClass: "text-amber-800 dark:text-amber-300",
    icon: AlertTriangle,
    label: "Warning",
  },
  info: {
    containerClass:
      "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800/50",
    iconClass: "text-sky-600 dark:text-sky-400",
    labelClass: "text-sky-800 dark:text-sky-300",
    icon: Info,
    label: "Info",
  },
} as const;

// ---------------------------------------------------------------------------
// Link builder
// ---------------------------------------------------------------------------

function buildLink(flag: Flag, basePath: string): string | null {
  switch (flag.targetType) {
    case "STOP":
    case "TRANSPORT":
    case "ACCOMMODATION":
      // Deep link to the overview page (stops / transport / accommodations tab)
      return `${basePath}`;
    case "DAY":
      if (flag.date) {
        return `${basePath}/day/${flag.date}`;
      }
      return null;
    case "TRIP":
      return basePath;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Single flag row
// ---------------------------------------------------------------------------

function FlagRow({ flag, tripBasePath }: { flag: Flag; tripBasePath: string }) {
  const config = SEVERITY_CONFIG[flag.severity];
  const Icon = config.icon;
  const link = buildLink(flag, tripBasePath);

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
        config.containerClass,
        link && "hover:opacity-80",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", config.iconClass)}
        aria-hidden="true"
      />
      <span className={cn("leading-snug", config.labelClass)}>
        {flag.message}
      </span>
    </div>
  );

  if (link) {
    return (
      <Link href={link} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function FlagSection({
  title,
  flags,
  tripBasePath,
}: {
  title: string;
  flags: Flag[];
  tripBasePath: string;
}) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({flags.length})
      </h3>
      <ul className="flex flex-col gap-2" role="list">
        {flags.map((flag) => (
          <li key={flag.id}>
            <FlagRow flag={flag} tripBasePath={tripBasePath} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FlagList
// ---------------------------------------------------------------------------

export function FlagList({ flags, tripBasePath }: FlagListProps) {
  const warnings = flags.filter((f) => f.severity === "warning");
  const infos = flags.filter((f) => f.severity === "info");

  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 dark:border-green-800/50 dark:bg-green-950/20">
        <CheckCircle2
          className="size-5 shrink-0 text-green-600 dark:text-green-400"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          No issues spotted — looks like a well-planned trip!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <FlagSection
        title="Warnings"
        flags={warnings}
        tripBasePath={tripBasePath}
      />
      <FlagSection
        title="Notes"
        flags={infos}
        tripBasePath={tripBasePath}
      />
    </div>
  );
}
