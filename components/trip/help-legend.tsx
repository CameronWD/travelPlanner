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

export interface LegendEntry {
  /** Plain-English description of what the control does. */
  meaning: string;
}

/** One entry per specimen row, in render order. */
export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  { meaning: "Add something new" },
  { meaning: "Edit what's there" },
  { meaning: "Delete it — you'll get an undo for a few seconds" },
  { meaning: "Done, or already in this plan" },
  { meaning: "Has a location, so it shows on the map" },
  { meaning: "Has a file attached — a ticket or booking" },
  { meaning: "Something needs your attention" },
  { meaning: "Has a set time, not just a day" },
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

/** A non-interactive replica of a ghost icon button. */
function IconSpecimen({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="icon" className="size-8" tabIndex={-1}>
      {children}
    </Button>
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
        <ul className="flex flex-col gap-2.5">
          <Row
            specimen={
              <Button variant="primary" size="sm" tabIndex={-1}>
                <Plus />
                Add
              </Button>
            }
            meaning={LEGEND_ENTRIES[0].meaning}
          />
          <Row
            specimen={
              <IconSpecimen>
                <Pencil className="size-4" />
              </IconSpecimen>
            }
            meaning={LEGEND_ENTRIES[1].meaning}
          />
          <Row
            specimen={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive"
                tabIndex={-1}
              >
                <Trash2 className="size-4" />
              </Button>
            }
            meaning={LEGEND_ENTRIES[2].meaning}
          />
        </ul>
      </div>

      {/* ── Little markers on things ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Little markers you&rsquo;ll see
        </h3>
        <ul className="flex flex-col gap-2.5">
          <Row
            specimen={<Check className="size-4 text-success" />}
            meaning={LEGEND_ENTRIES[3].meaning}
          />
          <Row
            specimen={<MapPin className="size-4 text-primary" />}
            meaning={LEGEND_ENTRIES[4].meaning}
          />
          <Row
            specimen={<Paperclip className="size-4 text-muted-foreground" />}
            meaning={LEGEND_ENTRIES[5].meaning}
          />
          <Row
            specimen={<AlertTriangle className="size-4 text-warning" />}
            meaning={LEGEND_ENTRIES[6].meaning}
          />
          <Row
            specimen={<Clock className="size-4 text-muted-foreground" />}
            meaning={LEGEND_ENTRIES[7].meaning}
          />
        </ul>
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
            <span className="text-sm text-muted-foreground">
              Amber means have a look. Red means something&rsquo;s wrong.
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile tab bar ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          The bar along the bottom (on your phone)
        </h3>
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
