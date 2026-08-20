import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  MapPin,
  Paperclip,
  AlertTriangle,
  Clock,
  Home,
  Map,
  CalendarDays,
  Wallet,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryPill } from "@/components/trip/category-pill";
import { ChapterChip } from "@/components/trip/chapter-chip";

/**
 * The button-and-icon key for the user guide.
 *
 * Every specimen below is the app's REAL component, not a picture of one, so
 * a props or styling change shows up here immediately (and breaks tsc if the
 * API moves). Specimens are aria-hidden illustrations — the adjacent text is
 * what a screen reader announces.
 *
 * NOTE: RowActions is deliberately not used. It takes onEdit/onDelete function
 * props, which a server component cannot pass to a client component; the
 * pencil/trash pair is replicated here with bare Buttons instead.
 */

/** Which block of the key a row belongs to. */
export type LegendGroup = "button" | "marker";

export interface LegendEntry {
  /** Which block of the key this row sits in. */
  group: LegendGroup;
  /** The app's real control, rendered as an inert illustration. */
  specimen: React.ReactNode;
  /** Plain-English description of what the control does. */
  meaning: string;
}

/** A non-interactive replica of a ghost icon button. */
function IconSpecimen({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="icon" className="size-8" tabIndex={-1}>
      {children}
    </Button>
  );
}

/**
 * One entry per specimen row, in render order.
 *
 * The specimen and its meaning live in the SAME object deliberately. They used
 * to be paired by index across two places, which meant a mis-pairing — a green
 * tick captioned "shows on the map" — was invisible to every test. Now the
 * component just maps over this array, so the pairing cannot drift.
 */
export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  {
    group: "button",
    specimen: (
      <Button variant="primary" size="sm" tabIndex={-1}>
        <Plus />
        Add
      </Button>
    ),
    meaning: "Add something new",
  },
  {
    group: "button",
    specimen: (
      <IconSpecimen>
        <Pencil className="size-4" />
      </IconSpecimen>
    ),
    meaning: "Edit what's there",
  },
  {
    group: "button",
    specimen: (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive"
        tabIndex={-1}
      >
        <Trash2 className="size-4" />
      </Button>
    ),
    // Deleting is never undoable: every delete opens a confirm dialog whose own
    // copy says "This can't be undone." The undo toast belongs to two other
    // actions entirely, so promising an undo here would be dangerous.
    meaning: "Delete it — you'll be asked to confirm first",
  },
  {
    group: "marker",
    specimen: <Check className="size-4 text-success" />,
    meaning: "Done, or already in this plan",
  },
  {
    group: "marker",
    specimen: <MapPin className="size-4 text-primary" />,
    meaning: "Has a location, so it shows on the map",
  },
  {
    // The paperclip button itself sits on every card. The NUMBER beside it is
    // the actual signal, so the specimen carries one.
    group: "marker",
    specimen: (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" />
        <span className="font-medium">2</span>
      </span>
    ),
    meaning: "A number beside the paperclip — that many files attached",
  },
  {
    group: "marker",
    specimen: <AlertTriangle className="size-4 text-warning" />,
    meaning: "Something needs your attention",
  },
  {
    group: "marker",
    specimen: <Clock className="size-4 text-muted-foreground" />,
    meaning: "Has a set time, not just a day",
  },
];

function Row({
  specimen,
  meaning,
}: {
  specimen: React.ReactNode;
  meaning: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        data-testid="legend-specimen"
        aria-hidden="true"
        className="flex w-11 shrink-0 items-center justify-center"
      >
        {specimen}
      </span>
      <span className="text-sm text-foreground">{meaning}</span>
    </li>
  );
}

/** Every row in one block of the key, in LEGEND_ENTRIES order. */
function LegendRows({ group }: { group: LegendGroup }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {LEGEND_ENTRIES.filter((entry) => entry.group === group).map((entry) => (
        <Row
          key={entry.meaning}
          specimen={entry.specimen}
          meaning={entry.meaning}
        />
      ))}
    </ul>
  );
}

export function HelpLegend() {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Buttons you'll tap ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Buttons you&rsquo;ll tap
        </h3>
        <LegendRows group="button" />
      </div>

      {/* ── Little markers on things ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Little markers you&rsquo;ll see
        </h3>
        <LegendRows group="marker" />
      </div>

      {/* ── Colour-coded labels ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Colour-coded labels
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryPill category="FOOD" />
            <span className="text-sm text-muted-foreground">
              The kind of thing it is. Each kind has its own colour.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChapterChip name="Italy" colour="rose" />
            <span className="text-sm text-muted-foreground">
              Which stretch of the trip it belongs to.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Needs attention</Badge>
            {/* Red is reserved for the hard-end overrun (plan-overview.tsx
                `over` tone, the Make it fit dialog, the "Over hard end" badge
                on Compare). Flags themselves are only ever amber or blue —
                keep this consistent with the "When something looks off"
                section of the guide. */}
            <span className="text-sm text-muted-foreground">
              Amber means have a look. Red turns up in one place only: when the
              plan runs past the day you have to be home.
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile tab bar ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          The bar along the bottom (on your phone)
        </h3>
        {/* Icon/label pairs are hand-copied from the real tab bar —
            components/trip/mobile-tab-bar.tsx:17-22 (its icon map is
            module-private). Keep the two in step. */}
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {[
            { icon: <Home className="size-5" />, label: "Home" },
            { icon: <Map className="size-5" />, label: "Plan" },
            { icon: <CalendarDays className="size-5" />, label: "Calendar" },
            { icon: <Wallet className="size-5" />, label: "Budget" },
            { icon: <Menu className="size-5" />, label: "More" },
          ].map(({ icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center text-muted-foreground"
              >
                {icon}
              </span>
              <span className="text-sm text-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
