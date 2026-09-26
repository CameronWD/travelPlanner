import * as React from "react";
import {
  BedDouble,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  Globe,
  Heart,
  List,
  ListChecks,
  Pin,
  Plus,
  Route,
  Search,
  Settings,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { HelpLegend } from "@/components/trip/help-legend";
import { HelpExpandAll } from "@/components/trip/help-expand-all";
import { HelpHashOpen } from "@/components/trip/help-hash-open";
import {
  HELP_SECTIONS,
  guideTripHref,
  type GuideTripSegment,
  type HelpSection,
} from "@/lib/help-guide";

/**
 * The in-app user guide body.
 *
 * Server component. Native <details> disclosures — no client state and no
 * accordion dependency, so browser find-in-page still reaches collapsed text
 * and the print stylesheet can force everything open.
 *
 * WRITING RULES (binding — see the plan's Global Constraints):
 *  - Warm, plain, second person. Short active sentences.
 *  - Use the UI's exact words, glossed on first use: "a Stop (a place you're
 *    based for a few nights)".
 *  - NEVER "activity" for a thing to do — Activity is the change-log tab.
 *  - NEVER "itinerary" for the Plan.
 *  - No personal names, no specific trip. This ships to every user.
 *  - Never mention Discreet mode. It was removed.
 */

/**
 * Print CSS — and the matching `:target` CSS — for opening a closed
 * <details> with no script.
 *
 * Two rules are needed in each case because engines disagree on how a closed
 * <details> hides its content. Older engines set `display: none` on the
 * children, so overriding their `display` is enough. Chromium >= 131, Safari
 * >= 18.4 and Firefox >= 139 instead put the content in a
 * `::details-content` box with `content-visibility: hidden`, where the
 * children's own `display` is irrelevant — those need the second rule. Keep
 * both, for print AND for `:target`.
 *
 * The `:target` pair is what makes a contents link to a closed section work
 * without JavaScript: the browser sets `:target` on the linked <details> as
 * it scrolls to it, and these rules force its content visible even though
 * the `open` attribute is never set.
 *
 * That is a FALLBACK, not the main path. Because these rules are `!important`
 * and keyed on `:target`, a section opened this way cannot be closed again —
 * `open` flips to false but the body stays visible. HelpHashOpen (rendered
 * below) sets `open` for real and strips the fragment, so `:target` stops
 * matching wherever script runs. Keep these rules for where it doesn't.
 *
 * `.help-print-hide` has no user in this file. It is a hook for the page
 * chrome around the guide (nav, buttons) to opt out of the printout.
 */
export const HELP_PRINT_STYLE = `
  @media print {
    details > summary { list-style: none; }
    details > *:not(summary) { display: block !important; }
    details::details-content { content-visibility: visible !important; }
    .help-print-hide { display: none !important; }
  }
  details:target > *:not(summary) { display: block !important; }
  details:target::details-content { content-visibility: visible !important; }
`;

/** A link into the trip, degrading to bold text when there is no trip. */
function Go({
  tripId,
  segment,
  children,
}: {
  tripId?: string;
  segment: GuideTripSegment;
  children: React.ReactNode;
}) {
  const href = guideTripHref(tripId, segment);
  if (!href) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  }
  return (
    <a
      href={href}
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  );
}

/**
 * Link to the Globe.
 *
 * Not a <Go>: the Globe is account-level, at /globe, so it is neither a trip
 * segment nor dependent on a tripId — it is a real link on the standalone
 * /help page too.
 */
function GlobeLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="/globe"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  );
}

/** Heading levels the guide can start at: h2 on /help, h3 under a trip page's h2. */
type GuideLevel = 2 | 3;
type HeadingTag = "h2" | "h3" | "h4";

/** Kit topic-card tile tones (admin.jsx `Help`): accent fill, on-accent glyph. */
const TILE_TONE = {
  coral: "bg-coral text-on-accent",
  sun: "bg-sun text-on-accent",
  teal: "bg-teal text-on-accent",
  lilac: "bg-lilac text-on-accent",
  white: "bg-card text-foreground",
} as const;

/**
 * Presentation only: the icon tile each section wears, as on the kit's Help
 * topic cards. Keyed by section id; lib/help-guide.ts stays pure data.
 */
const SECTION_TILES: Record<string, { icon: LucideIcon; tone: keyof typeof TILE_TONE }> = {
  "sixty-seconds": { icon: Timer, tone: "coral" },
  "trip-shape": { icon: Route, tone: "teal" },
  "things-to-do": { icon: Plus, tone: "coral" },
  "giving-a-day": { icon: CalendarDays, tone: "sun" },
  undecided: { icon: Heart, tone: "lilac" },
  "sleeping-moving": { icon: BedDouble, tone: "lilac" },
  money: { icon: Wallet, tone: "sun" },
  "getting-ready": { icon: ListChecks, tone: "teal" },
  together: { icon: Users, tone: "lilac" },
  search: { icon: Search, tone: "teal" },
  away: { icon: Clock, tone: "sun" },
  "something-off": { icon: CircleAlert, tone: "coral" },
  chapters: { icon: List, tone: "lilac" },
  "dates-and-pins": { icon: Pin, tone: "sun" },
  "make-it-fit": { icon: CalendarClock, tone: "sun" },
  forks: { icon: Copy, tone: "coral" },
  globe: { icon: Globe, tone: "teal" },
  "trip-settings": { icon: Settings, tone: "white" },
  "word-list": { icon: BookOpen, tone: "lilac" },
};

/**
 * One collapsible section, drawn as the kit's Help topic card: icon tile,
 * h5-type title, body-s blurb. Collapsed cards tile three-up like the kit;
 * an open one spans the row so its body has room.
 */
function Section({
  section,
  open,
  heading: Title,
  /**
   * Only the 60-second section sets this: its `<ol>` reflows into
   * `lg:columns-2` and needs the full row `open:col-span-full` gives it, so
   * it opts out of the reading-measure cap every other section's body keeps
   * (fix round 1: that cap was dropped for everyone, which let all 20 other
   * topics' prose run edge-to-edge once opened at `lg`).
   */
  bodyUnconstrained,
  children,
}: {
  section: HelpSection;
  open?: boolean;
  /** One level below the group heading (a server component: no context). */
  heading: HeadingTag;
  bodyUnconstrained?: boolean;
  children: React.ReactNode;
}) {
  const tile = SECTION_TILES[section.id];
  if (!tile) throw new Error(`No help tile for section: ${section.id}`);
  const TileIcon = tile.icon;
  return (
    <details
      id={section.id}
      open={open}
      className="group rounded-lg border-2 border-border bg-card p-4 text-card-foreground shadow-hard-2 open:col-span-full target:col-span-full print:col-span-full"
    >
      <summary className="flex cursor-pointer list-none items-start gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">
        <span
          data-slot="help-tile"
          aria-hidden="true"
          className={cn(
            "grid size-[34px] shrink-0 place-items-center rounded-sm border-2 border-border",
            TILE_TONE[tile.tone],
          )}
        >
          <TileIcon className="size-4" strokeWidth={2.5} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Title className="font-display text-base font-bold leading-tight text-foreground">
            {section.title}
          </Title>
          <span className="text-[13px] font-medium leading-snug text-muted-foreground">
            {section.blurb}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="mt-2 size-[18px] shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          strokeWidth={2.5}
        />
      </summary>
      <div className="mt-3.5 border-t-2 border-border-soft pt-3.5">
        <div
          className={cn(
            "flex flex-col gap-3 text-sm leading-relaxed text-foreground",
            !bodyUnconstrained && "max-w-reading",
          )}
        >
          {children}
        </div>
      </div>
    </details>
  );
}

/** Look a section up by id so bodies can't drift from the data module. */
function sectionById(id: string): HelpSection {
  const found = HELP_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown help section: ${id}`);
  return found;
}

/** Shared list styling — kept in one place so every section reads the same. */
const LIST_CLASS = "flex flex-col gap-2 pl-5";

/** Group-heading type: the kit's h3 (24/800, tight). */
const GROUP_HEADING = "font-display text-2xl font-extrabold leading-tight tracking-[-0.03em] text-foreground";
/** The kit's topic grid: one column on phone, three-up on desktop. Print is one
 *  column: HELP_PRINT_STYLE opens bodies without setting [open], so
 *  open:col-span-full can't widen them there. `grid-flow-row-dense` backfills
 *  the gap an `open:col-span-full` card would otherwise leave beside it in the
 *  row above, without changing the column count itself (no `auto-rows-fr`:
 *  that would stretch every row to the expanded card's height). */
// LA-027: a lone last card in an otherwise-full grid spans the row instead of
// leaving a blank half/third-width gap beside it. Two rules, because the
// everyday grid's first card (the 60-second version) opens by default and
// spans the whole row (`open:col-span-full` below) — while it's open, the
// OTHER 11 cards fill the grid on their own, so it's the *even* DOM position
// that lands alone (12th child, 11th "real" card); if a reader closes that
// hero card by hand, all 12 cards become uniform again and land evenly with
// no orphan, so the even-position rule is scoped with `:has()` to only the
// hero-open shape — it must not also fire once the hero is closed, which
// would strand the second-to-last card instead. The plain odd-position rule
// covers every TOPIC_GRID list with no such hero (Advanced, Reference).
export const TOPIC_GRID =
  "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-1 grid-flow-row-dense sm:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 sm:[&:has(>*:first-child[open])>*:last-child:nth-child(even)]:col-span-2 lg:[&:has(>*:first-child[open])>*:last-child:nth-child(even)]:col-span-1";

export function HelpGuide({
  tripId,
  level = 2,
}: {
  tripId?: string;
  /**
   * Heading level for the guide's group headings. 2 under a page <h1>
   * (/help); 3 under a trip page's <h2>, since the trip layout owns the <h1>.
   * Sections and the key's blocks sit one level below.
   */
  level?: GuideLevel;
}) {
  const Group = `h${level}` as HeadingTag;
  const Sub = `h${level + 1}` as HeadingTag;
  return (
    <div className="flex flex-col gap-8">
      <style>{HELP_PRINT_STYLE}</style>
      <HelpHashOpen />

      {/* ── Contents ──
          Server-rendered anchors. With script, HelpHashOpen opens whichever
          section is linked to and clears the fragment so it can be closed
          again; without script, the :target rules above still open it. */}
      <nav
        aria-label="Contents"
        className="help-print-hide rounded-lg border-2 border-border bg-background p-[18px] text-card-foreground shadow-hard-2"
      >
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <Group className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
            What&rsquo;s in here
          </Group>
          <HelpExpandAll />
        </div>
        {/* gap-y-4: chips are 28px with a 44px ::after (8px spill each side),
            so 16px between rows keeps neighbouring hit areas from overlapping. */}
        <ol className="flex flex-wrap gap-x-2 gap-y-4">
          {HELP_SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="relative inline-flex min-h-7 items-center rounded-full border-2 border-border bg-card px-2.5 py-1 text-[11px] font-extrabold leading-tight text-foreground transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Always-visible key ── */}
      <section aria-labelledby="help-legend-heading">
        <Group id="help-legend-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          What the buttons mean
        </Group>
        <div className="rounded-lg border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-2">
          <HelpLegend headingLevel={level + 1 as 3 | 4} />
        </div>
      </section>

      {/* ── Everyday sections ── */}
      <section aria-labelledby="help-everyday-heading">
        <Group id="help-everyday-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          Using it day to day
        </Group>
        <div className={TOPIC_GRID}>
          {/* One <Section> per everyday id, in HELP_SECTIONS order. */}
          <Section heading={Sub} section={sectionById("sixty-seconds")} open bodyUnconstrained>
            <p className="max-w-reading">
              The whole app is one loop. Six steps, and you have a planned trip.
            </p>
            <ol
              aria-label="The 60-second version"
              className="flex flex-col gap-2 pl-5 list-decimal lg:block lg:columns-2 lg:gap-8 lg:[&>li]:mb-2 [&>li]:break-inside-avoid"
            >
              <li>
                Open{" "}
                <Go tripId={tripId} segment="plan">
                  Plan
                </Go>
                . This is your trip laid out in order, first day at the top.
              </li>
              <li>
                Find the place you want to plan. Each one is a card, with
                everything about it already on show.
              </li>
              <li>
                Add the things you want to do there. They sit under that place
                until you decide when.
              </li>
              <li>
                Give each one a day on{" "}
                <Go tripId={tripId} segment="calendar">
                  Days
                </Go>
                . This is the step everyone forgets — the next two sections are
                all about it.
              </li>
              <li>
                Put a number against anything that costs money, then watch the
                running total on{" "}
                <Go tripId={tripId} segment="budget">
                  Money
                </Go>
                .
              </li>
              <li>
                Glance at{" "}
                <Go tripId={tripId} segment="summary">
                  Summary
                </Go>
                . It reads the whole trip back to you and points out what&rsquo;s
                missing.
              </li>
            </ol>
            <p className="max-w-reading">
              You can stop anywhere in that loop and come back later. Nothing has
              to be finished, everything saves as you go, and the other one of you
              picks up your changes the next time they open the screen.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("trip-shape")}>
            <p>
              Everything about your trip hangs off one screen:{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              . If someone has already put your places and dates in, this section
              is just so that screen makes sense the first time you open it. If
              it&rsquo;s still empty, that&rsquo;s where you start — add the
              places, and the rest of the app fills itself in around them.
            </p>
            <p>
              It reads top to bottom, in the order you&rsquo;ll travel. Two
              things make up the shape:
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">A Stop</strong> — a place
                you&rsquo;re based for a few nights. Each one is a card showing
                its dates and how many nights you&rsquo;re there.
              </li>
              <li>
                <strong className="font-semibold">The Home base</strong> — where
                you set off from. It shows as a card above the first place and,
                if you&rsquo;re coming home again, below the last one, so the
                plan reads out from home and back to it.
              </li>
            </ul>
            <p>
              A long trip can have one more thing:{" "}
              <strong className="font-semibold">Chapters</strong>, coloured
              bands that group a stretch of the trip into one piece, the way
              you&rsquo;d talk about &ldquo;the Italy bit&rdquo;. A new trip
              doesn&rsquo;t have them — they&rsquo;re off until you ask for
              them. Open the{" "}
              <strong className="font-semibold">Chapters</strong> menu at the
              bottom of the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>{" "}
              and choose{" "}
              <strong className="font-semibold">Group into chapters</strong> to
              switch them on. There&rsquo;s a section further down on what
              they do.
            </p>
            <p>
              In the gaps between the Stop cards you&rsquo;ll find the flights,
              trains and drives that join them. Inside each card you&rsquo;ll
              find where you&rsquo;re sleeping and the things you&rsquo;ve
              planned to do there.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("things-to-do")}>
            {/* The main flow: Plan → a Stop → "Add Thing to Do". */}
            <p>
              This is the one you&rsquo;ll use most. Go to{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              , find the place, and tap{" "}
              <strong className="font-semibold">Add Thing to Do</strong> at the
              bottom of its card.
            </p>
            <p>A form opens. Only the first line is required:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Title</strong> — what it is, in
                your own words. &ldquo;Walk up the hill for sunset&rdquo; is a
                perfectly good entry.
              </li>
              <li>
                <strong className="font-semibold">Category</strong> — what kind
                of thing it is: sightseeing, food and drink, and so on. It sets
                the colour it shows in and how it&rsquo;s grouped on Money.
              </li>
              <li>
                <strong className="font-semibold">Stop</strong> — which place it
                belongs to. It&rsquo;s already filled in from the card you
                tapped, so you can skip past it.
              </li>
              <li>
                <strong className="font-semibold">Date</strong> — leave this
                blank for now, and read the box below before you fill it in.
              </li>
              <li>
                <strong className="font-semibold">Start time</strong> and{" "}
                <strong className="font-semibold">End time</strong> — optional,
                and only available once there&rsquo;s a date. This is where a
                booked time goes.
              </li>
              <li>
                <strong className="font-semibold">Address</strong> — worth
                filling in, because an address will usually put the thing on that
                day&rsquo;s map. The app looks the address up as it saves, and
                only what it can place gets plotted.
              </li>
              <li>
                <strong className="font-semibold">Link</strong> — the page you
                found it on, so neither of you has to search for it again.
              </li>
              <li>
                <strong className="font-semibold">Booking reference</strong> —
                the confirmation code, once you have one.
              </li>
              <li>
                <strong className="font-semibold">Notes</strong> — anything else
                worth remembering.
              </li>
              <li>
                <strong className="font-semibold">Cost</strong> — roughly what
                you reckon it comes to. A guess is fine; sharpen it later.
              </li>
            </ul>
            {/* MUST include the callout below, exactly this testid. */}
            <p
              data-testid="undated-callout"
              className="island rounded-md border-2 border-border bg-warning px-3 py-2 text-foreground"
            >
              <strong className="font-semibold">Worth knowing:</strong> a thing
              to do won&rsquo;t show up on{" "}
              <Go tripId={tripId} segment="calendar">
                Days
              </Go>{" "}
              until you give it a day. That&rsquo;s on purpose — it&rsquo;s
              parked against the place, waiting for you to decide when. Giving
              it a day is a separate step, and it&rsquo;s the next section.
            </p>
            <p>
              Once saved, it appears as a line under that place. Tap the pencil
              beside it to change anything — including giving it that day.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("giving-a-day")}>
            <p>
              Giving something a day is what puts it on{" "}
              <Go tripId={tripId} segment="calendar">
                Days
              </Go>
              , on that day&rsquo;s own page, and on the screen you&rsquo;ll live
              off while you&rsquo;re travelling. Two routes work on something
              you&rsquo;ve already got; the third is for putting something new
              straight onto a day.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">From the plan.</strong> Tap the
                pencil next to the thing and fill in{" "}
                <strong className="font-semibold">Date</strong>. That&rsquo;s the
                whole job.
              </li>
              <li>
                <strong className="font-semibold">From Days.</strong> The
                toggle at the top switches between{" "}
                <strong className="font-semibold">Month</strong> — a grid of the
                whole month — and{" "}
                <strong className="font-semibold">Agenda</strong>, one day after
                another down the page. In Month view your{" "}
                <Go tripId={tripId} segment="wishlist">
                  Wishlist
                </Go>{" "}
                appears alongside it, as long as you&rsquo;ve put something on it
                — in a column beside the grid on a wide screen, stacked
                underneath on a phone. Drag an idea onto a day and it puts a{" "}
                <strong className="font-semibold">copy</strong> there: the idea
                stays on the board, now ticked so you can see it&rsquo;s in the
                plan. The little calendar button beside it does exactly the
                same thing, for when dragging is fiddly.
              </li>
              <li>
                <strong className="font-semibold">
                  Something new, straight onto a day.
                </strong>{" "}
                Tap a date to open that day, then use{" "}
                <strong className="font-semibold">Add to this day</strong> near
                the bottom. This one writes a brand-new entry on that date, so
                only reach for it when the thing doesn&rsquo;t exist yet — if
                it&rsquo;s already parked under a place, go back to the pencil, or
                you&rsquo;ll end up with two of it.
              </li>
            </ul>
            <p>
              <strong className="font-semibold">Times are optional.</strong> A
              day with no times on it works fine. If you do set them, anything
              with a time is listed in time order and anything without one sits
              underneath — so &ldquo;get to the market at some point&rdquo;
              doesn&rsquo;t pretend to be at nine sharp.
            </p>
            <p>
              A day page is worth opening at least once. When the app knows where
              the place is on a map, the top of the page shows the weather and how
              much daylight you get — the difference between a sunset walk being
              lovely and being in the dark. Below that,{" "}
              <strong className="font-semibold">Show day map</strong> draws
              the day&rsquo;s plans as a numbered route with tonight&rsquo;s bed
              marked on it, and hands the whole thing over to your phone&rsquo;s
              maps app when you want directions.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("undecided")}>
            <p>
              Not every idea is ready for a day.{" "}
              <Go tripId={tripId} segment="wishlist">
                Wishlist
              </Go>{" "}
              is where the maybes live: a shared pool for the whole trip, kept
              deliberately out of the plan, so you can pile things in without
              committing to any of them.
            </p>
            <p>
              <strong className="font-semibold">Votes</strong> are the
              how-do-we-both-feel step. Each of you marks an idea{" "}
              <strong className="font-semibold">Must</strong>,{" "}
              <strong className="font-semibold">Keen</strong> or{" "}
              <strong className="font-semibold">Meh</strong>, and both marks show
              side by side. It finds the things you both actually want without a
              conversation about every single one.
            </p>
            <p>
              If you&rsquo;re part of a Globe, an{" "}
              <strong className="font-semibold">Add from Globe</strong> button
              appears at the top of the board, pulling in places you saved on
              some earlier trip. Can&rsquo;t see it? Open your{" "}
              <GlobeLink>Globe</GlobeLink> once — that first visit is what
              creates it. There&rsquo;s a section on the Globe further down.
            </p>
            <p>
              One thing that catches people out: putting an idea on a day never
              takes it off the board. Every route does the same thing —{" "}
              <strong className="font-semibold">Schedule this</strong> on an
              idea&rsquo;s card, the little calendar button on the Wishlist
              column beside Days, and dragging an idea straight onto a
              day all put a <strong className="font-semibold">copy</strong> on
              the day you pick. The idea itself stays on the board, now with a
              tick and &ldquo;in this plan&rdquo; beside it. That&rsquo;s
              deliberate, because the Wishlist is shared by every version of the
              plan, so the same idea can sit on day three of one and day five of
              another.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("sleeping-moving")}>
            <p>
              Two more things hang off the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              , and both live on the Stop cards rather than Days.
            </p>
            <p>
              <strong className="font-semibold">Accommodation</strong> is where
              you sleep. Tap{" "}
              <strong className="font-semibold">Add accommodation</strong> on a
              place&rsquo;s card and fill in the check-in and check-out dates,
              the address, and the{" "}
              <strong className="font-semibold">Booking confirmation</strong>{" "}
              off the booking email. The app checks those dates against your
              nights there, so a night with nowhere booked gets pointed out
              rather than discovered.
            </p>
            <p>
              <strong className="font-semibold">Transport</strong> is how you get
              from one place to the next — flight, train, drive, ferry, whatever
              it is. The{" "}
              <strong className="font-semibold">Add transport</strong> buttons
              sit in the gaps between the Stop cards, so the leg you&rsquo;re
              adding is the one you&rsquo;re looking at. Record the mode, where
              and when it leaves and arrives, and the{" "}
              <strong className="font-semibold">
                Booking reference / number
              </strong>{" "}
              — one box, whatever you&rsquo;re travelling on.
            </p>
            <p>
              Both of them take a{" "}
              <strong className="font-semibold">Cost</strong> in the same form,
              so you never have to go somewhere else to write down what the hotel
              came to.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("money")}>
            <p>
              Anything that costs money carries two numbers, and they mean
              different things. Getting this straight makes the whole of{" "}
              <Go tripId={tripId} segment="budget">
                Money
              </Go>{" "}
              read properly.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Cost</strong> is what the thing
                costs. While you&rsquo;re still guessing, put your best number
                in. Once it&rsquo;s booked, put the real price in. It&rsquo;s the
                same box either way, so you never have to invent a guess for
                something whose price you already know.
              </li>
              <li>
                <strong className="font-semibold">Paid</strong> is money that has
                left your account. Tick{" "}
                <strong className="font-semibold">Paid</strong> and the app asks
                how much and when, offered pre-filled with the cost — so
                confirming something that came to exactly what you expected is
                one tap. Nothing is ever recorded as paid without an amount, so
                &ldquo;paid&rdquo; always means a real number.
              </li>
            </ul>
            <p>
              Enter each amount in the currency you were charged in. The app
              converts everything into your trip&rsquo;s home currency for the
              totals, and you can override a rate if you know better than it
              does.
            </p>
            <p>
              <Go tripId={tripId} segment="budget">
                Money
              </Go>{" "}
              is where it all adds up: a row of totals along the top — what the
              trip costs, what you&rsquo;ve paid, what&rsquo;s still to pay and
              what it comes to a day — then the same money broken down{" "}
              <strong className="font-semibold">By category</strong>,{" "}
              <strong className="font-semibold">By destination</strong>,{" "}
              <strong className="font-semibold">By chapter</strong> and{" "}
              <strong className="font-semibold">Day by day</strong> — cost down
              one side, paid down the other. There&rsquo;s no limit or target to
              set. It only ever tells you where you are.
            </p>
            <p>
              It&rsquo;s also the quickest way to catch up on a batch of
              payments.{" "}
              <strong className="font-semibold">
                Mark off what you&rsquo;ve paid
              </strong>{" "}
              lists everything and lets you tick down it in one sitting.{" "}
              <strong className="font-semibold">Other costs</strong> — off to the
              side on a wide screen, further down the page on a phone — is for
              money that isn&rsquo;t attached to anything on the plan:
              insurance, visas, a travel SIM, spending money. Both of those
              belong to the real plan, so neither shows while you&rsquo;re
              editing a variant — a second version of the plan, which has a
              section of its own further down.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("getting-ready")}>
            <p>
              <Go tripId={tripId} segment="checklists">
                Checklists
              </Go>{" "}
              is where the ticking-off lives.{" "}
              <strong className="font-semibold">Pre-trip</strong> is the admin —
              visas, insurance, a travel SIM, telling the bank — and each line
              can carry a due date and whichever of you is doing it.{" "}
              <strong className="font-semibold">Packing</strong> is the packing
              list, and you can save one as a template to pull into your next
              trip instead of starting from nothing. There&rsquo;s a third tab,{" "}
              <strong className="font-semibold">Booking parser</strong>, for
              pulling the details out of a booking email.
            </p>
            <p>
              <Go tripId={tripId} segment="files">
                Files
              </Go>{" "}
              is where tickets, confirmations and passport scans go. Upload them
              here and they&rsquo;re grouped by what they belong to. You can also
              attach a file without coming here. A place, and the bookings on
              it, carry a paperclip button on a wide screen — on a phone, look
              under the card&rsquo;s ⋯ menu. Either way, the number beside it
              tells you something&rsquo;s attached. A thing to do is the
              exception: it takes its files in its own form, once you&rsquo;ve
              saved it. Whichever way you attach something, it turns up here as
              well.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("together")}>
            <p>
              There are two of you in here, and the app assumes you&rsquo;re
              rarely looking at it at the same moment.
            </p>
            <p>
              <strong className="font-semibold">Notes</strong> are for talking
              about one specific thing. You can leave one on any place, on any
              booking, and on any idea on the{" "}
              <Go tripId={tripId} segment="wishlist">
                Wishlist
              </Go>
              , and what you write stays attached to it — so &ldquo;the 6am one
              is cheaper but brutal&rdquo; sits next to the flight it&rsquo;s
              about instead of scrolling away in a chat. On a wide screen the
              speech-bubble button is on the card itself; on a phone, look under
              the card&rsquo;s ⋯ menu. A thing to do parked under a place has no
              speech bubble of its own — it has the plain{" "}
              <strong className="font-semibold">Notes</strong> box in its own
              form, and it&rsquo;s ideas on the Wishlist that take the
              back-and-forth.
            </p>
            <p>
              <Go tripId={tripId} segment="activity">
                Activity
              </Go>{" "}
              is the record of who changed what: added, edited or deleted, and
              for an edit, what it was before and after. It&rsquo;s the answer to
              &ldquo;did you move those nights, or did I?&rdquo;.
            </p>
            <p>
              The bell at the top of the screen is the short version. Its count
              only ever counts the other one&rsquo;s changes, so you&rsquo;re
              never nudged about your own — though the list you open from it
              shows the most recent changes from both of you. Opening that list
              doesn&rsquo;t clear the count on its own:{" "}
              <strong className="font-semibold">Mark all read</strong> at the
              top of it does, and so does opening{" "}
              <Go tripId={tripId} segment="activity">
                Activity
              </Go>
              , which clears it as you read.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("search")}>
            <p>
              Once a trip has a few weeks in it, scrolling to find one booking
              gets old. There&rsquo;s one box that solves it, and it&rsquo;s
              worth learning early: the{" "}
              <strong className="font-semibold">Search or jump…</strong> bar at
              the top of every screen. On a phone it&rsquo;s the magnifying
              glass. From a keyboard, <strong className="font-semibold">⌘K</strong>{" "}
              opens it from anywhere — <strong className="font-semibold">Ctrl+K</strong>{" "}
              if you&rsquo;re on Windows.
            </p>
            <p>Start typing and it offers three kinds of answer:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Go to</strong> — every screen
                in this trip, so &ldquo;mon&rdquo; is enough to land on{" "}
                <Go tripId={tripId} segment="budget">
                  Money
                </Go>
                . Your other trips are in here too, marked{" "}
                <strong className="font-semibold">Switch →</strong>, which is
                the quickest way to cross from one trip to another.
              </li>
              <li>
                <strong className="font-semibold">Do</strong> — a short list of
                things rather than places: start a{" "}
                <strong className="font-semibold">New trip</strong>, open your
                Globe, jump to adding a Stop or an idea, or{" "}
                <strong className="font-semibold">Toggle theme</strong> to flip
                between light and dark.
              </li>
              <li>
                <strong className="font-semibold">Find</strong> — the actual
                searching. It looks through this trip&rsquo;s places, the things
                you&rsquo;ve planned to do, your flights and trains, and where
                you&rsquo;re staying. Trains and flights also match on their
                reference, so pasting a booking code finds the leg. Each result
                takes you to where that thing lives.
              </li>
            </ul>
            <p>
              Two things worth knowing.{" "}
              <strong className="font-semibold">Find</strong> only ever searches
              the real plan — anything that only exists inside a variant
              won&rsquo;t come back, which is deliberate, so a search never
              hands you something that isn&rsquo;t really happening. And Find
              needs a signal: offline it says{" "}
              <strong className="font-semibold">
                Search needs a connection
              </strong>
              , though jumping between screens carries on working.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("away")}>
            <p>
              Once you&rsquo;re travelling, the trip&rsquo;s{" "}
              <strong className="font-semibold text-foreground">Home</strong>{" "}
              screen changes job. It stops counting down and starts showing
              today: what&rsquo;s on and in what order, how long until your next
              flight or train, where you&rsquo;re sleeping tonight, and what
              you&rsquo;ve spent so far. It&rsquo;s built to be read one-handed
              on a phone.
            </p>
            <p>
              <Go tripId={tripId} segment="journal">
                Journal
              </Go>{" "}
              is the other half of being away. Every day page has a box to write
              in and a dashed <strong className="font-semibold">+</strong> tile
              that opens your photos, and the Journal tab gathers every day
              you&rsquo;ve written into one thread to read back afterwards.
            </p>
            <p>
              You won&rsquo;t always have signal. Pages you&rsquo;ve already
              opened keep working when you lose it, so the day you looked at over
              breakfast is still there in a tunnel. Changes do need a connection
              to save, though — so don&rsquo;t count on editing while
              you&rsquo;re offline.
            </p>
            <p>
              If you&rsquo;d rather see the trip alongside the rest of your life,
              the trip can publish a private calendar feed your phone&rsquo;s
              calendar app follows. Nothing is published until you ask for it:
              you&rsquo;ll find it in the trip&rsquo;s settings, where{" "}
              <strong className="font-semibold">Create calendar feed</strong>{" "}
              gives you the link to subscribe to. It runs one way only — your
              plans appear in your calendar, and nothing you do in your calendar
              comes back.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("something-off")}>
            <p>
              You don&rsquo;t have to spot the problems yourself. The app reads
              the plan and raises a{" "}
              <strong className="font-semibold">Flag</strong> when something
              looks wrong or missing. They collect on{" "}
              <Go tripId={tripId} segment="summary">
                Summary
              </Go>
              .
            </p>
            <p>Flags are things like:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>a night somewhere with nowhere booked to sleep</li>
              <li>no way to get from one place to the next</li>
              <li>a day with far too much on, or two things booked at once</li>
              <li>
                a departure or arrival time that doesn&rsquo;t line up with the
                dates you&rsquo;re there
              </li>
              <li>
                a day whose plans are miles apart, or an unreasonably long drive
              </li>
              <li>a stay so short it&rsquo;s barely worth unpacking</li>
              <li>the plan running past the day you have to be home</li>
            </ul>
            <p>
              A Flag is always something you can do something about, and they come
              in two strengths. Amber is the loud one — the app thinks this wants
              fixing. Blue is just for information, worth knowing but not a
              problem. The Summary lists the amber ones first. Flags themselves
              are only ever amber or blue — a Flag is never red, a nudge rather
              than a failure. But the app does turn red when the plan runs past
              the day you have to be home: that shows on the Plan, again in the
              Make it fit dialog, and as an{" "}
              <strong className="font-semibold">Over hard end</strong> badge
              when you compare plans. (Red shows up elsewhere too, wherever
              something&rsquo;s about to be deleted or a form has a problem —
              it&rsquo;s not saved just for Flags.)
            </p>
            <p>
              Once your trip has dates, and up until the day you set off, the
              trip&rsquo;s Home screen carries the same information as{" "}
              <strong className="font-semibold">Next steps</strong> — a short
              ranked list of what to deal with next, mixing the Flags in with
              gentler nudges like places that still have no dates or a packing
              list you haven&rsquo;t started. Each line takes you to the screen
              where you fix it. When the list is empty, you really are done.
            </p>
          </Section>
        </div>
      </section>

      {/* ── Advanced ── */}
      <section aria-labelledby="help-advanced-heading">
        <Group id="help-advanced-heading" className={GROUP_HEADING}>
          Going deeper
        </Group>
        <p className="mb-3.5 mt-1 text-[13px] font-medium text-muted-foreground">
          None of this is needed to plan a trip. Come back when you&rsquo;re
          curious.
        </p>
        <div className={TOPIC_GRID}>
          {/* One <Section> per advanced id. */}
          <Section heading={Sub} section={sectionById("chapters")}>
            <p>
              Chapters are off to begin with, so if you&rsquo;ve never turned
              them on this whole section is about something you won&rsquo;t see
              yet. Open the{" "}
              <strong className="font-semibold">Chapters</strong> menu at the
              bottom of the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>{" "}
              and choose{" "}
              <strong className="font-semibold">Group into chapters</strong>.
              The same menu has{" "}
              <strong className="font-semibold">Turn off chapters</strong> when
              you&rsquo;ve had enough of them — your bands aren&rsquo;t thrown
              away, they just stop showing. Switch them back on and they come
              back redrawn around wherever your places have moved to in the
              meantime, so a band never comes back stale.
            </p>
            <p>
              A <strong className="font-semibold">Chapter</strong> is a coloured
              band over a stretch of dates. It gives you something to group by:
              the plan, the{" "}
              <Go tripId={tripId} segment="budget">
                Money
              </Go>{" "}
              and the{" "}
              <Go tripId={tripId} segment="summary">
                Summary
              </Go>{" "}
              all roll up per Chapter, so you can see what a week in one country
              came to without adding it up yourself.
            </p>
            <p>
              The thing to understand is that{" "}
              <strong className="font-semibold">dates decide membership</strong>,
              not you. A place belongs to whichever Chapter&rsquo;s dates cover
              the day you arrive there. That has three consequences:
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                Chapters can&rsquo;t overlap. A day belongs to one band or none,
                and days under no band are simply ungrouped.
              </li>
              <li>
                A Chapter is always one unbroken run of the trip. You can&rsquo;t
                have a band that skips out and comes back later, so if your route
                revisits a country the app suggests a single band across the
                whole stretch, named after the countries in it.
              </li>
              <li>
                Re-date a place and its Chapter heals itself. The band stretches
                to cover where the place moved to, instead of going stale or
                quietly dropping it.
              </li>
            </ul>
            <p>
              Both ways of making one live in that same{" "}
              <strong className="font-semibold">Chapters</strong> menu on the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              : <strong className="font-semibold">New Chapter</strong> draws one
              by hand, and{" "}
              <strong className="font-semibold">Suggest from countries</strong>{" "}
              proposes a set based on where you&rsquo;re going. Either way you
              can rename and redraw them freely afterwards — a suggestion is only
              a starting point.
            </p>
            <p>
              A leg that crosses from one Chapter into the next belongs to
              neither. You&rsquo;ll find it on the card of the place it leaves
              from, and on Money it sits on its own{" "}
              <strong className="font-semibold">Between legs</strong> line rather
              than being counted inside either band&rsquo;s total.
            </p>
            <p>
              While a stretch has no dates yet, a Chapter works differently: you
              drag places into it by hand. The moment those places get dates it
              becomes an ordinary band and dates take over.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("dates-and-pins")}>
            <p>
              Every place is in one of two states.{" "}
              <strong className="font-semibold">Rough</strong> means a place and
              a rough number of nights, with no dates at all — a sketch.{" "}
              <strong className="font-semibold">Scheduled</strong> means it has a
              real arrive and depart date. One trip mixes the two freely, and you
              turn sketches into dates a bit at a time.
            </p>
            <p>
              <strong className="font-semibold">Firm up</strong> is the button
              that does the turning. It flows dates forward: a place starts on
              the trip&rsquo;s start date, or on the day the previous place ends,
              stays for its rough number of nights, and hands the next date to
              the place after it.{" "}
              <strong className="font-semibold">Firm up all stops</strong> at the
              top of the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>{" "}
              does the whole trip in one pass; each Chapter has its own{" "}
              <strong className="font-semibold">Firm up</strong> as well, if
              you&rsquo;d rather go a leg at a time.
            </p>
            <p>
              Nothing is locked afterwards. Change one place from three nights
              to five and the places after it shift along to make room — but
              only as far as they have to. A gap already sitting in the plan
              absorbs the change, and everything past that gap stays exactly
              where it is. That&rsquo;s the ripple, and it is the same engine
              that re-dates the plan when you drag a place into a different
              position, which is why you don&rsquo;t have to clear dates before
              reordering.
            </p>
            <p>
              <strong className="font-semibold">Pinned</strong> is how you say
              &ldquo;don&rsquo;t move this&rdquo;. Pin the place with the
              non-refundable hotel, or the one built around a fixed date, and the
              ripple flows the flexible places around it and stops dead at the
              pin. If what comes before a pin can no longer fit, the app says so
              on the spot — a message telling you the pin was kept — rather than
              quietly overwriting the booking, and any slack left in front of a
              pin simply sits there as free days.
            </p>
            <p>
              The reverse of firming up makes a place rough again so you can go
              back to sketching it. On a wide screen it&rsquo;s the{" "}
              <strong className="font-semibold">Clear dates</strong> button on
              the place&rsquo;s card; on a phone it&rsquo;s{" "}
              <strong className="font-semibold">Make rough</strong> in that
              card&rsquo;s ⋯ menu. Same thing either way.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("make-it-fit")}>
            <p>
              If you&rsquo;ve told the app the day you have to be home, it keeps
              checking the plan against it. When the plan runs past that day, it
              offers to help you make it fit.
            </p>
            <p>It lays out two ways through, side by side:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Trim nights</strong> — take
                nights off the places that aren&rsquo;t pinned, split in
                proportion to how long you&rsquo;re staying at each. What it
                suggests never takes a place below one night, but the numbers are
                yours to edit, so you can shuffle which place gives up what — and
                take one down to nothing — before you commit.
              </li>
              <li>
                <strong className="font-semibold">Or drop a stop</strong> — take
                one place out altogether. Each candidate shows the day the plan
                would
                then end on, so you can see which one actually closes the gap.
              </li>
            </ul>
            <p>
              Pinned places are never trimmed and never dropped. And nothing at
              all changes until you tap{" "}
              <strong className="font-semibold">Apply trim</strong> or confirm a
              drop — everything before that is a preview you can walk away from.
            </p>
            <p>
              If trimming everything to the bone still won&rsquo;t reach the
              date, it says so plainly and points you at the three real options:
              drop a place, unpin one, or move the day you have to be home.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("forks")}>
            <p>
              A <strong className="font-semibold">variant</strong> is a second
              version of the plan, kept beside the real one. Italy first, or
              Switzerland bolted on the end? Up in the trip header, next to the
              member avatars and the notification bell, there&rsquo;s a dropdown
              for this — open it and tap{" "}
              <strong className="font-semibold">New variant</strong> to get one
              of each to look at side by side instead of arguing in the
              abstract. It stays with you across the Plan, Money and the
              Wishlist — the screens that follow the variant you&rsquo;re
              editing. Everywhere else,
              including every dated screen, keeps showing the real plan, and the
              switcher steps aside altogether once you&rsquo;re travelling or
              the trip is over. (You&rsquo;ll see this called a Fork here and
              there — same thing.)
            </p>
            <p>
              A variant is a full plan, not a sketch. You edit it with exactly the
              same tools, and it gets its own dates, its own Flags and its own
              total. While you&rsquo;re in one, a banner along the top says{" "}
              <strong className="font-semibold">Editing variant</strong>, names
              the one you&rsquo;re in, and tells you it isn&rsquo;t live —{" "}
              your calendar, summary and sharing still follow your real plan.
              That&rsquo;s the whole point: editing a variant never touches the
              real plan, the dated screens, the{" "}
              <Go tripId={tripId} segment="summary">
                Summary
              </Go>{" "}
              or the calendar feed, so you can make as much mess in one as you
              like. The Wishlist, the checklists and the journal are shared by
              all of them.
            </p>
            <p>
              <Go tripId={tripId} segment="compare">
                Compare plans
              </Go>{" "}
              puts them in columns with the real plan on the left, and shows each
              variant as a difference against it: which places were added,
              dropped, re-nighted or reordered, and how the end date, the total
              and the number of Flags move.
            </p>
            <p>
              When you&rsquo;ve decided,{" "}
              <strong className="font-semibold">Promote</strong> makes that
              variant the real plan — and discards every other version, including
              the one it replaces. It can&rsquo;t be undone, so the confirmation
              spells out what the swap would lose: payments you&rsquo;ve
              recorded, confirmation numbers, and files attached to the plan being
              replaced. Read that list before you tap it.
            </p>
            <p>
              Variants are only offered before you leave. Once the trip is under
              way there&rsquo;s nothing left to compare.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("globe")}>
            <p>
              Everything else in here belongs to one trip. Your{" "}
              <GlobeLink>Globe</GlobeLink> doesn&rsquo;t. It&rsquo;s the map of
              everywhere you&rsquo;d like to go one day, kept across all your
              trips, so the restaurant someone recommended has a home even when
              there&rsquo;s no trip to put it on yet.
            </p>
            <p>
              Each place on it is a{" "}
              <strong className="font-semibold">Marker</strong>.{" "}
              <strong className="font-semibold">Add Marker</strong> drops one:
              use <strong className="font-semibold">Place search</strong> to
              find it and the app pins it for you. Give it a category and a
              note about why you saved it — in two years&rsquo; time
              &ldquo;Tokyo&rdquo; on its own tells you nothing. You can hang a
              file off a Marker too, for the screenshot you saved it from.
            </p>
            <p>
              The point of it is what happens when a trip finally goes that way.
              On a trip&rsquo;s{" "}
              <Go tripId={tripId} segment="wishlist">
                Wishlist
              </Go>
              , <strong className="font-semibold">Add from Globe</strong> pulls
              a Marker in, and the board suggests Markers near where
              you&rsquo;re going without you having to remember them. Pulling
              one in takes a <strong className="font-semibold">copy</strong> —
              the Marker stays on the Globe for the next trip, and editing the
              copy inside the trip doesn&rsquo;t change it.
            </p>
            <p>
              Your Globe is made the first time you open it. That&rsquo;s the
              whole trick to it: if{" "}
              <strong className="font-semibold">Add from Globe</strong>{" "}
              isn&rsquo;t on your Wishlist yet, open your{" "}
              <GlobeLink>Globe</GlobeLink> once and the button is there from
              then on. A Globe can also be shared, so two of you collect into
              the same one.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("trip-settings")}>
            <p>
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>{" "}
              is the housekeeping — you&rsquo;ll open it a handful of times and
              then forget it exists. It&rsquo;s in the{" "}
              <strong className="font-semibold">More</strong> menu.
            </p>
            <p>
              <strong className="font-semibold">Travellers</strong> is who can
              see the trip.{" "}
              <strong className="font-semibold">Add a Traveller by email</strong>{" "}
              names the person you want on it. Nothing is sent to them — the
              invite simply sits there marked{" "}
              <strong className="font-semibold">Pending</strong>, and turns into
              real access the next time they sign in with that address. Tell
              them yourself, in other words. You can cancel one while
              it&rsquo;s still pending.
            </p>
            <p>
              <strong className="font-semibold">New share link</strong> is the
              other way to let someone see the trip: a read-only page for
              people who aren&rsquo;t planning it with you — a parent who wants
              to know where you&rsquo;ll be. Give each one a label (who it&rsquo;s
              for) and choose what it shows — Accommodation, Transport, Daily
              plans — route and dates are always included, and costs, notes
              and booking confirmations are never shared on any link, whatever
              you tick. Make as many as you like, one per audience, and{" "}
              <strong className="font-semibold">Revoke</strong> the ones you no
              longer need. Anyone with a link can open it, so treat it as
              public. It&rsquo;s a different thing from adding a Traveller, who
              gets to edit.
            </p>
            <p>
              <strong className="font-semibold">Create calendar feed</strong> is
              the one-way feed into your phone&rsquo;s calendar described
              earlier, and{" "}
              <strong className="font-semibold">Include in feed</strong> chooses
              how much of the trip goes into it.{" "}
              <strong className="font-semibold">Regenerate</strong> makes a
              fresh link and kills the old one, which is what you want if
              you&rsquo;ve shared it too widely.
            </p>
            <p>
              <strong className="font-semibold">Road winding factor</strong> and
              the setting beside it are how the app guesses driving times. Real
              roads are longer than the straight line between two places and you
              don&rsquo;t drive them flat out; if its estimates feel wrong for
              where you&rsquo;re going, nudge these.
            </p>
            <p>
              At the bottom, in red, are the two that can&rsquo;t be taken back
              — and only the person who created the trip sees them.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Duplicate</strong> starts a
                brand-new trip from this one&rsquo;s bones — the same places,
                chapters, wishlist and checklists, and the legs that join the
                places up, stripped back to just the mode. Every date is wiped,
                ready to sketch again. Give it a{" "}
                <strong className="font-semibold">Name for the duplicate</strong>{" "}
                and you&rsquo;re done. The trip you copied isn&rsquo;t touched.
                Your co-travellers aren&rsquo;t added automatically — each one
                gets invited to the duplicate and joins once they accept.
              </li>
              <li>
                <strong className="font-semibold">Delete trip</strong> removes
                it and everything in it — every place, every thing to do, every
                cost and payment, the checklists, the journal, and the files
                you&rsquo;ve uploaded. It asks you to type the trip&rsquo;s name
                first, and then{" "}
                <strong className="font-semibold">Delete forever</strong> means
                it. There is no undo and no copy kept, so if you only want it
                out of the way, consider whether you actually want it gone.
              </li>
            </ul>
          </Section>
        </div>
      </section>

      {/* ── Reference ── */}
      <section aria-labelledby="help-reference-heading">
        <Group id="help-reference-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          Looking something up
        </Group>
        <div className={TOPIC_GRID}>
          {/* The word-list section. */}
          <Section heading={Sub} section={sectionById("word-list")}>
            <p>
              The app is fussy about its words, because two of you are reading
              the same screens. Here&rsquo;s the lot, in plain English.
            </p>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="font-semibold text-foreground">Stop</dt>
                <dd className="text-muted-foreground">
                  A place you&rsquo;re based for a stretch of the trip. Your trip
                  is a run of Stops in order.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Chapter</dt>
                <dd className="text-muted-foreground">
                  A named, coloured band over a run of dates, grouping a stretch
                  of the trip into one piece. Chapters can&rsquo;t overlap, and
                  they don&rsquo;t have to cover the whole trip.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Home base</dt>
                <dd className="text-muted-foreground">
                  Where you set off from, and come back to on a round trip. It
                  bookends the plan but holds no nights of its own.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Thing to do</dt>
                <dd className="text-muted-foreground">
                  Something you want to see, eat or do. It can sit under a place
                  with no date yet, or be given a day and land on Days.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Wishlist</dt>
                <dd className="text-muted-foreground">
                  The shared pool of ideas for this trip that haven&rsquo;t been
                  given a day. Shared by every version of the plan.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Globe</dt>
                <dd className="text-muted-foreground">
                  Your everywhere-someday map, shared across all your trips
                  rather than owned by one. Each place on it is a Marker.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Vote</dt>
                <dd className="text-muted-foreground">
                  How keen you are on a Wishlist idea — Must, Keen or Meh — so
                  you can both see where you stand.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Accommodation</dt>
                <dd className="text-muted-foreground">
                  Where you sleep at a place: check-in and check-out, address,
                  confirmation number, cost.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Transport</dt>
                <dd className="text-muted-foreground">
                  A leg between two places, with times and a reference number.
                  It can be a flight, train, bus, car or ferry — and anything
                  that isn&rsquo;t one of those goes under Other.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Cost</dt>
                <dd className="text-muted-foreground">
                  What something costs — your best number while you&rsquo;re
                  guessing, the real price once it&rsquo;s booked.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Paid</dt>
                <dd className="text-muted-foreground">
                  Money that has left your account, with the amount and the date
                  it went. Never recorded without an amount.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Flag</dt>
                <dd className="text-muted-foreground">
                  Something the app noticed and thinks you should fix — a
                  missing booking, an impossible day. Always actionable.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Next steps</dt>
                <dd className="text-muted-foreground">
                  The ranked list of what to deal with next — Flags plus gentler
                  nudges — on the trip&rsquo;s Home screen while you&rsquo;re
                  still planning.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Variant</dt>
                <dd className="text-muted-foreground">
                  A what-if version of the plan, kept beside the real one for
                  comparison. Not live until you promote it. Also called a Fork.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Pinned</dt>
                <dd className="text-muted-foreground">
                  A place whose dates you&rsquo;ve fixed. Nothing shifts it.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Rough</dt>
                <dd className="text-muted-foreground">
                  A place with a number of nights but no dates yet — the sketch
                  stage.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Firm up</dt>
                <dd className="text-muted-foreground">
                  Turning rough places into real dates by flowing the nights
                  forward — from the trip&rsquo;s start, or from where the place
                  before it ends.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Journal</dt>
                <dd className="text-muted-foreground">
                  What you write and the photos you keep, day by day, while
                  you&rsquo;re away.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Activity</dt>
                <dd className="text-muted-foreground">
                  The change log: who added, edited or deleted what, and when.
                </dd>
              </div>
            </dl>
          </Section>
        </div>
      </section>
    </div>
  );
}
