import * as React from "react";
import Link from "next/link";
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
  LayoutGrid,
  Link2,
  List,
  ListChecks,
  MessageSquarePlus,
  NotebookPen,
  Pin,
  Plus,
  Route,
  Search,
  Settings,
  Smartphone,
  Sunrise,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES, type Hue } from "@/lib/hues";
import { HelpLegend } from "@/components/trip/help-legend";
import { HelpExpandAll } from "@/components/trip/help-expand-all";
import { HelpHashOpen } from "@/components/trip/help-hash-open";
import {
  HELP_GROUP_LABELS,
  HELP_LEGEND_ID,
  HELP_SECTIONS,
  guideTripHref,
  helpContents,
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
  weight,
  children,
}: {
  tripId?: string;
  segment: GuideTripSegment;
  /** "inherit" keeps the surrounding weight (a link inside a display title). */
  weight?: "inherit";
  children: React.ReactNode;
}) {
  const href = guideTripHref(tripId, segment);
  if (!href) {
    return (
      <strong className={cn(weight ? "[font-weight:inherit]" : "font-semibold", "text-foreground")}>
        {children}
      </strong>
    );
  }
  return (
    <a
      href={href}
      className={cn(
        weight ? "[font-weight:inherit]" : "font-medium",
        "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary",
      )}
    >
      {children}
    </a>
  );
}

/**
 * Link to an account-level page (/globe, /account, /trips, /trips/new).
 *
 * Not a <Go>: these pages belong to the Traveller rather than a Trip, so they
 * are neither trip segments nor dependent on a tripId — they are real links on
 * the standalone /help page too.
 */
function SiteLink({ href, children }: { href: "/globe" | "/account" | "/trips" | "/trips/new"; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </Link>
  );
}

function GlobeLink({ children }: { children: React.ReactNode }) {
  return <SiteLink href="/globe">{children}</SiteLink>;
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
  "your-trips": { icon: LayoutGrid, tone: "sun" },
  "trip-shape": { icon: Route, tone: "teal" },
  "things-to-do": { icon: Plus, tone: "coral" },
  "giving-a-day": { icon: CalendarDays, tone: "sun" },
  "the-day": { icon: Sunrise, tone: "teal" },
  undecided: { icon: Heart, tone: "lilac" },
  "sleeping-moving": { icon: BedDouble, tone: "lilac" },
  money: { icon: Wallet, tone: "sun" },
  "getting-ready": { icon: ListChecks, tone: "teal" },
  together: { icon: Users, tone: "lilac" },
  search: { icon: Search, tone: "teal" },
  away: { icon: Clock, tone: "sun" },
  journal: { icon: NotebookPen, tone: "lilac" },
  "something-off": { icon: CircleAlert, tone: "coral" },
  account: { icon: UserRound, tone: "teal" },
  feedback: { icon: MessageSquarePlus, tone: "coral" },
  chapters: { icon: List, tone: "lilac" },
  "dates-and-pins": { icon: Pin, tone: "sun" },
  "make-it-fit": { icon: CalendarClock, tone: "sun" },
  forks: { icon: Copy, tone: "coral" },
  globe: { icon: Globe, tone: "teal" },
  "trip-settings": { icon: Settings, tone: "white" },
  links: { icon: Link2, tone: "teal" },
  "home-screen": { icon: Smartphone, tone: "sun" },
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
  children,
}: {
  section: HelpSection;
  open?: boolean;
  /** One level below the group heading (a server component: no context). */
  heading: HeadingTag;
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
        <div className="flex max-w-reading flex-col gap-3 text-sm leading-relaxed text-foreground">
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
// LA-027: a lone last card in an otherwise-full two-column grid spans the row
// instead of leaving a blank half-width gap beside it. Which card lands alone
// depends on whether the FIRST card is open, because an open card spans the
// whole row (`open:col-span-full` below) and drops out of the pairing:
//  - first card closed: every card pairs up, so an ODD total strands the last
//    one — the odd-position rule, scoped with `:not(:has())` to this shape;
//  - first card open (nothing is open by default now, but the reader can open
//    it): the rest pair up on their own, so an EVEN total strands the last one — the
//    even-position rule, scoped with `:has()` to this shape.
// Scoping BOTH rules keeps this right for any section count: an unscoped odd
// rule would, with the hero open and an odd total, span the last card and
// strand the one before it instead. At lg's three columns neither applies.
export const TOPIC_GRID =
  "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-1 grid-flow-row-dense sm:[&:not(:has(>*:first-child[open]))>*:last-child:nth-child(odd)]:col-span-2 lg:[&:not(:has(>*:first-child[open]))>*:last-child:nth-child(odd)]:col-span-1 sm:[&:has(>*:first-child[open])>*:last-child:nth-child(even)]:col-span-2 lg:[&:has(>*:first-child[open])>*:last-child:nth-child(even)]:col-span-1";

/**
 * "The life of one trip": six steps down the page, each with a numbered,
 * hue-coloured icon tile and a link into the app. A function of `tripId`
 * because the links sit inside the bodies: a <Go>'s text must be the nav's
 * own label for its route (drift guard in help-guide.test.tsx), so each step
 * links only the page name. Step 1 is account-level, so it links on /help too.
 */
function lifeOfOneTrip(tripId?: string): {
  icon: LucideIcon;
  hue: Hue;
  key: string;
  title: string;
  body: React.ReactNode;
}[] {
  return [
    {
      icon: Plus,
      hue: "coral",
      key: "make",
      title: "Make a trip",
      body: (
        <>
          <SiteLink href="/trips/new">New trip</SiteLink> asks for a name, a
          rough month or real dates, and your home base. That&rsquo;s all it
          needs to exist.
        </>
      ),
    },
    {
      icon: Route,
      hue: "sun",
      key: "stops",
      title: "Sketch the stops",
      body: (
        <>
          On <Go tripId={tripId} segment="plan">Plan</Go>, add the places
          you&rsquo;ll be based in and a rough number of nights each, in the
          order you&rsquo;ll travel.
        </>
      ),
    },
    {
      icon: Pin,
      hue: "leaf",
      key: "dates",
      title: "Firm up the dates",
      body: (
        <>
          Still on <Go tripId={tripId} segment="plan">Plan</Go>: firm up from
          the start, and pin whatever is already booked so it stays put.
        </>
      ),
    },
    {
      icon: CalendarDays,
      hue: "sky",
      key: "days",
      title: "Fill the days",
      body: (
        <>
          Open a place on <Go tripId={tripId} segment="plan">Plan</Go>, or a
          day on <Go tripId={tripId} segment="day">Days</Go>, and add the
          things to do, the beds, and the trains between.
        </>
      ),
    },
    {
      icon: Wallet,
      hue: "lilac",
      key: "money",
      title: "Put money on it",
      body: (
        <>
          <Go tripId={tripId} segment="budget">Money</Go> keeps what each thing
          costs, what&rsquo;s been paid, and what&rsquo;s still to pay.
        </>
      ),
    },
    {
      icon: Users,
      hue: "teal",
      key: "people",
      title: "Bring your people",
      body: (
        <>
          In <Go tripId={tripId} segment="settings">Settings</Go>, invite them
          by email or make a share link. Want to try two versions of the trip?
          Make a what-if plan and compare them side by side.
        </>
      ),
    },
  ];
}

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

      {/* ── Contents (below lg; the page's OnThisPage rail takes over from lg) ──
          Server-rendered anchors. With script, HelpHashOpen opens whichever
          section is linked to and clears the fragment so it can be closed
          again; without script, the :target rules above still open it. */}
      <nav
        aria-label="Contents"
        className="help-print-hide rounded-lg border-2 border-border bg-background p-[18px] text-card-foreground shadow-hard-2 lg:hidden"
      >
        <Group className="mb-3.5 font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          What&rsquo;s in here
        </Group>
        {/* gap-y-4: chips are 28px with a 44px ::after (8px spill each side),
            so 16px between rows keeps neighbouring hit areas from overlapping. */}
        <ol className="flex flex-wrap gap-x-2 gap-y-4">
          {helpContents()
            .flatMap((g) => g.entries)
            .map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className="relative inline-flex min-h-7 items-center rounded-full border-2 border-border bg-card px-2.5 py-1 text-[11px] font-extrabold leading-tight text-foreground transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {entry.title}
                </a>
              </li>
            ))}
        </ol>
      </nav>

      {/* ── What Teepee is ── */}
      <section id="what-teepee-is" aria-labelledby="help-what-heading" className="scroll-mt-20 md:scroll-mt-6">
        <Group id="help-what-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          {sectionById("what-teepee-is").title}
        </Group>
        <p className="max-w-reading text-[15px] font-medium leading-relaxed text-foreground">
          Teepee is a place to plan a trip with the people going on it. It
          starts as a rough idea, a name and a month, and grows
          into the days you&rsquo;re away: where you&rsquo;re staying, what
          you&rsquo;re doing and what it costs. When you&rsquo;re home again,
          it&rsquo;s where you look back on it.
        </p>
      </section>

      {/* ── The walkthrough ── */}
      <section id="the-life-of-one-trip" aria-labelledby="help-walk-heading" className="scroll-mt-20 md:scroll-mt-6">
        <Group id="help-walk-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          {sectionById("the-life-of-one-trip").title}
        </Group>
        <div className="rounded-lg border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-2">
          <ol aria-label="The life of one trip" className="flex max-w-reading flex-col gap-3">
            {lifeOfOneTrip(tripId).map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.key} className="flex items-start gap-3.5">
                  {/* The number sits OUTSIDE the island: inside it, bg-card
                      is re-scoped to a translucent cream that reads badly
                      over the dark page where the badge overhangs. */}
                  <span aria-hidden="true" className="relative shrink-0">
                    <span
                      data-slot="walk-tile"
                      className={cn(
                        "island grid size-11 place-items-center rounded-lg border-2 border-border",
                        HUE_CLASSES[s.hue].fill,
                      )}
                    >
                      <Icon className="size-5" strokeWidth={2.5} />
                    </span>
                    <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border-2 border-border bg-card font-display text-[11px] font-extrabold text-foreground">
                      {i + 1}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span data-slot="walk-title" className="font-display text-base font-extrabold tracking-[-0.02em]">
                      {s.title}
                    </span>
                    <span className="text-sm text-muted-foreground">{s.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── The key ── */}
      <section id={HELP_LEGEND_ID} aria-labelledby="help-legend-heading" className="scroll-mt-20 md:scroll-mt-6">
        <Group id="help-legend-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          What the buttons mean
        </Group>
        <div className="rounded-lg border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-2">
          <HelpLegend headingLevel={level + 1 as 3 | 4} />
        </div>
      </section>

      {/* ── Everyday sections ── */}
      <section aria-labelledby="help-everyday-heading">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <Group id="help-everyday-heading" className={GROUP_HEADING}>
            {HELP_GROUP_LABELS.everyday}
          </Group>
          <HelpExpandAll />
        </div>
        <div data-slot="help-topic-grid" className={TOPIC_GRID}>
          {/* One <Section> per everyday id, in HELP_SECTIONS order. */}

          <Section heading={Sub} section={sectionById("your-trips")}>
            <p>
              <SiteLink href="/trips">Your trips</SiteLink> is where the app
              opens: every trip you&rsquo;re on as a card, soonest first. Each
              wears a label for where it&rsquo;s up to:{" "}
              <strong className="font-semibold">Idea</strong>,{" "}
              <strong className="font-semibold">Planning</strong>,{" "}
              <strong className="font-semibold">Up next</strong>,{" "}
              <strong className="font-semibold">On the road</strong> or{" "}
              <strong className="font-semibold">Done</strong>. No cover photo?
              The card draws one from your route, in the trip&rsquo;s own colour.
            </p>
            <p>
              <strong className="font-semibold">New trip</strong> starts
              another; drop a{" "}
              <strong className="font-semibold">Cover photo</strong> onto its
              form and you&rsquo;ll see it before you save.
            </p>
            <p>
              Underneath,{" "}
              <strong className="font-semibold">Your travels</strong> maps every
              trip&rsquo;s places. On a wide screen, choose a trip&rsquo;s chip
              for just that one. The{" "}
              <strong className="font-semibold">Tally</strong> counts countries,
              nights and distance, planned or already been.
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
              it&rsquo;s still empty, that&rsquo;s where you start. Add the
              places, and the rest of the app fills itself in around them.
            </p>
            <p>
              It reads top to bottom, in the order you&rsquo;ll travel. Two
              things make up the shape:
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">A stop</strong>: a place
                you&rsquo;re based for a few nights. Each one is a card showing
                its dates and how many nights you&rsquo;re there.
              </li>
              <li>
                <strong className="font-semibold">The home base</strong>: where
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
              doesn&rsquo;t have them. They&rsquo;re off until you ask for
              them: in{" "}
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>
              , switch on{" "}
              <strong className="font-semibold">Group this trip into chapters</strong>.
              There&rsquo;s a section further down on what they do.
            </p>
            <p>
              In the gaps between the stop cards you&rsquo;ll find the flights,
              trains and drives that join them. Inside each card you&rsquo;ll
              find where you&rsquo;re sleeping and the things you&rsquo;ve
              planned to do there.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("things-to-do")}>
            {/* The main flow: Plan → a Stop → "Add an idea". */}
            <p>
              This is the one you&rsquo;ll use most. Go to{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              , open the place, and tap{" "}
              <strong className="font-semibold">Add an idea</strong>.
            </p>
            <p>A form opens. Only the first line is required:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Title</strong>: what it is, in
                your own words. &ldquo;Walk up the hill for sunset&rdquo; is a
                perfectly good entry.
              </li>
              <li>
                <strong className="font-semibold">Category</strong>: what kind
                of thing it is: sightseeing, food and drink, and so on. It sets
                the colour it shows in and how it&rsquo;s grouped on Money.
              </li>
              <li>
                <strong className="font-semibold">Stop</strong>: which place it
                belongs to. It&rsquo;s already filled in from the card you
                tapped, so you can skip past it.
              </li>
              <li>
                <strong className="font-semibold">Date</strong>: leave this
                blank for now, and read the box below before you fill it in.
              </li>
              <li>
                <strong className="font-semibold">Start time</strong> and{" "}
                <strong className="font-semibold">End time</strong>: optional,
                and only available once there&rsquo;s a date. This is where a
                booked time goes.
              </li>
              <li>
                <strong className="font-semibold">Address</strong>: worth
                filling in, because an address will usually put the thing on that
                day&rsquo;s map. The app looks the address up as it saves, and
                only what it can place gets plotted.
              </li>
              <li>
                <strong className="font-semibold">Link</strong>: the page you
                found it on, so neither of you has to search for it again.
              </li>
              <li>
                <strong className="font-semibold">Booking reference</strong>:
                the confirmation code, once you have one.
              </li>
              <li>
                <strong className="font-semibold">Notes</strong>: anything else
                worth remembering.
              </li>
              <li>
                <strong className="font-semibold">Cost</strong>: roughly what
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
                Calendar
              </Go>{" "}
              until you give it a day. That&rsquo;s on purpose. It&rsquo;s
              parked against the place, waiting for you to decide when. Giving
              it a day is a separate step, and it&rsquo;s the next section.
            </p>
            <p>
              Once saved, it appears as a line under that place. Tap the pencil
              beside it to change anything, including giving it that day.
            </p>
            <p>
              Reopen it and you can also give it a{" "}
              <strong className="font-semibold">photo</strong>: one picture,
              so &ldquo;that cathedral&rdquo; means the same thing to both of
              you. Tap <strong className="font-semibold">Add a photo</strong>{" "}
              on the open form. It works the same way on a{" "}
              <Go tripId={tripId} segment="wishlist">
                Wishlist
              </Go>{" "}
              idea, and scheduling an idea carries its photo along with it.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("giving-a-day")}>
            <p>
              Giving something a day is what puts it on{" "}
              <Go tripId={tripId} segment="calendar">
                Calendar
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
                <strong className="font-semibold">From Calendar.</strong> The
                toggle at the top switches between{" "}
                <strong className="font-semibold">Month</strong>: a grid of the
                whole month, and{" "}
                <strong className="font-semibold">Agenda</strong>, one day after
                another down the page. In Month view your{" "}
                <Go tripId={tripId} segment="wishlist">
                  Wishlist
                </Go>{" "}
                appears alongside it, as long as you&rsquo;ve put something on it,
                in a column beside the grid on a wide screen, stacked
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
                only reach for it when the thing doesn&rsquo;t exist yet. If
                it&rsquo;s already parked under a place, go back to the pencil, or
                you&rsquo;ll end up with two of it.
              </li>
            </ul>
            <p>
              <strong className="font-semibold">Times are optional.</strong> A
              day with no times on it works fine. If you do set them, anything
              with a time is listed in time order and anything without one sits
              underneath, so &ldquo;get to the market at some point&rdquo;
              doesn&rsquo;t pretend to be at nine sharp.
            </p>
            <p>
              You can also give the day itself a name. Open the day and tap{" "}
              <strong className="font-semibold">Add a title</strong> under the
              date, or use the small + at the end of a day row on this
              stop&rsquo;s card. &ldquo;Sintra day trip&rdquo; or &ldquo;Rest
              day&rdquo; reads better than a bare
              date, and the name follows the day wherever it shows:{" "}
              <Go tripId={tripId} segment="calendar">
                Calendar
              </Go>
              , the day&rsquo;s own page, Home while you&rsquo;re travelling,
              and the Journal.
            </p>
            <p>
              A day&rsquo;s own page is worth opening at least once. The next
              section is all about it.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("the-day")}>
            <p>
              <Go tripId={tripId} segment="day">
                Days
              </Go>{" "}
              shows one day at a time: the screen to open over breakfast. The
              strip along the top runs through the whole trip, coloured by where
              you&rsquo;re sleeping; tap a day, swipe on a phone, or use the
              arrow keys. A day spent travelling, with no stop of its own, shows
              as a dashed stretch named after the leg that covers it.
            </p>
            <p>
              The page holds the{" "}
              <strong className="font-semibold">Day plan</strong>, the weather,{" "}
              <strong className="font-semibold">Tonight</strong> (where
              you&rsquo;re sleeping), and your Journal box, with{" "}
              <strong className="font-semibold">Add to this day</strong> at the
              top for something new.{" "}
              <strong className="font-semibold">Show day map</strong> draws the
              day as a route and hands it to your phone&rsquo;s maps app.
            </p>
            <p>
              The day you swap places shows under both stops&rsquo; cards on the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              .
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
              <GlobeLink>Globe</GlobeLink> once: that first visit is what
              creates it. There&rsquo;s a section on the Globe further down.
            </p>
            <p>
              One thing that catches people out: putting an idea on a day never
              takes it off the board. Every route does the same thing:{" "}
              <strong className="font-semibold">Schedule this</strong> on an
              idea&rsquo;s card, the little calendar button on the Wishlist
              column beside Calendar, and dragging an idea straight onto a
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
              , and both live on the stop cards rather than Calendar.
            </p>
            <p>
              <strong className="font-semibold">Accommodation</strong> is where
              you sleep. Open a place, tap{" "}
              <strong className="font-semibold">Add a stay</strong> and fill in the check-in and check-out dates,
              the address, and the{" "}
              <strong className="font-semibold">Booking confirmation</strong>{" "}
              off the booking email. The app checks those dates against your
              nights there, so a night with nowhere booked gets pointed out
              rather than discovered.
            </p>
            <p>
              <strong className="font-semibold">Transport</strong> is how you get
              from one place to the next: flight, train, drive, ferry, whatever
              it is. The{" "}
              <strong className="font-semibold">Add transport</strong> buttons
              sit in the gaps between the stop cards, so the leg you&rsquo;re
              adding is the one you&rsquo;re looking at. Record the mode, where
              and when it leaves and arrives, and the{" "}
              <strong className="font-semibold">
                Booking ref · only people on the trip see this
              </strong>
              : one box, whatever you&rsquo;re travelling on.
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
                how much and when, offered pre-filled with the cost, so
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
              is where it all adds up: what the trip costs up top, what that
              comes to a night and, when you&rsquo;re sharing, each, split
              into what you pay{" "}
              <strong className="font-semibold">Before you go</strong> and{" "}
              <strong className="font-semibold">On the trip</strong>, with a bar
              for how much of it is paid. Below it,{" "}
              <strong className="font-semibold">Where it goes</strong> breaks the
              same money down by category, place, chapter or day. There&rsquo;s
              no limit or target to set. It only ever tells you where you are.
            </p>
            <p>
              It&rsquo;s also the quickest way to catch up on a batch of
              payments. <strong className="font-semibold">To pay</strong> lists
              every cost, what&rsquo;s still owed first and the soonest due at
              the top. One tap marks a cost paid, and its menu has{" "}
              <strong className="font-semibold">Mark partly paid</strong> for
              when it came to something else.{" "}
              <strong className="font-semibold">Add a cost</strong> is for money
              that isn&rsquo;t attached to anything on the plan: insurance,
              visas, a travel SIM, spending money. Both belong to the real plan,
              so neither shows while you&rsquo;re editing a what-if plan, a
              second version of the plan with a section of its own further
              down.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("getting-ready")}>
            <p>
              <Go tripId={tripId} segment="checklists">
                Checklists
              </Go>{" "}
              is where the ticking-off lives.{" "}
              <strong className="font-semibold">Pre-trip</strong> is the admin:
              visas, insurance, a travel SIM, telling the bank. Each line
              can carry a due date and whichever of you is doing it.{" "}
              <strong className="font-semibold">Packing</strong> is the packing
              list, and you can save one as a template to pull into your next
              trip instead of starting from nothing. Pulling the details out
              of a booking email lives on{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>{" "}
              instead: <strong className="font-semibold">Paste a booking</strong>,
              near the top.
            </p>
            <p>
              <strong className="font-semibold">Reminders</strong> live here
              too, above the tabs: your own dated notes for the trip,
              &ldquo;print the insurance docs&rdquo; against 28 Nov, separate
              from a Checklist item because they&rsquo;re said once rather
              than ticked off. <strong className="font-semibold">Add Reminder</strong>{" "}
              writes one, with an optional stop it&rsquo;s about. One due
              within the next week also turns up in{" "}
              <strong className="font-semibold">Next steps</strong> on Home,
              so you don&rsquo;t have to come looking for it.
            </p>
            <p>
              <Go tripId={tripId} segment="files">
                Files
              </Go>{" "}
              is where tickets, confirmations and passport scans go. Upload them
              here and they&rsquo;re grouped by what they belong to. You can also
              attach a file without coming here. On a place, look under its
              card&rsquo;s ⋯ menu; the bookings on it carry a paperclip button
              on a wide screen. On a phone, look under their ⋯ menu. Either
              way, the number beside it tells you something&rsquo;s attached. A thing to do is the
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
              , and what you write stays attached to it, so &ldquo;the 6am one
              is cheaper but brutal&rdquo; sits next to the flight it&rsquo;s
              about instead of scrolling away in a chat. On a place, Notes is
              in its card&rsquo;s ⋯ menu; on a booking, the speech-bubble
              button is on the card itself on a wide screen, and under its ⋯
              menu on a phone. A thing to do parked under a place has no
              speech bubble of its own. It has the plain{" "}
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
              never nudged about your own, though the list you open from it
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
              <strong className="font-semibold">Search or jump…</strong> box at
              the top of the sidebar on a wide screen. On a narrower window
              it&rsquo;s the magnifying glass under the Teepee mark on the left.
              On a phone it&rsquo;s the magnifying glass at the top of a trip.
              Away from a trip, it&rsquo;s on the{" "}
              <strong className="font-semibold">You</strong> tab. From a
              keyboard, <strong className="font-semibold">⌘K</strong>{" "}
              opens it from anywhere (
              <strong className="font-semibold">Ctrl+K</strong>{" "}
              if you&rsquo;re on Windows).
            </p>
            <p>Start typing and it offers three kinds of answer:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Go to</strong>: every screen
                in this trip, so &ldquo;mon&rdquo; is enough to land on{" "}
                <Go tripId={tripId} segment="budget">
                  Money
                </Go>
                . Your other trips are in here too, marked{" "}
                <strong className="font-semibold">Switch →</strong>, which is
                the quickest way to cross from one trip to another.
              </li>
              <li>
                <strong className="font-semibold">Do</strong>: a short list of
                things rather than places: start a{" "}
                <strong className="font-semibold">New trip</strong>, open your
                Globe, or jump to adding a stop or an idea.
              </li>
              <li>
                <strong className="font-semibold">Find</strong>: the actual
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
              the real plan. Anything that only exists inside a what-if plan
              won&rsquo;t come back, which is deliberate, so a search never
              hands you something that isn&rsquo;t really happening. And Find
              needs a signal: offline it says{" "}
              <strong className="font-semibold">
                Search needs a connection
              </strong>
              , though jumping between screens carries on working.
            </p>
            <p>
              Prefer to browse than to search?{" "}
              <strong className="font-semibold">All trips</strong>, in the trip
              switcher, takes you back to{" "}
              <SiteLink href="/trips">Your trips</SiteLink>. There&rsquo;s a
              section on it near the top of this guide.
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
              is the other half of being away. It has a section of its own
              just below.
            </p>
            <p>
              You won&rsquo;t always have signal. Pages you&rsquo;ve already
              opened keep working when you lose it, and the trip you opened
              last is kept on your phone on purpose.{" "}
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>{" "}
              shows it as <strong className="font-semibold">Saved for offline</strong>,
              with a <strong className="font-semibold">Save again</strong>{" "}
              button if you want it fresh. Changes do need a connection to save,
              though, so don&rsquo;t count on editing while you&rsquo;re
              offline. The one exception is a Feedback note: write it offline
              and it waits, then sends itself when you&rsquo;re back.
            </p>
            <p>
              If you&rsquo;d rather see the trip alongside the rest of your life,
              the trip can publish a private calendar feed your phone&rsquo;s
              calendar app follows. Nothing is published until you ask for it:
              you&rsquo;ll find it in the trip&rsquo;s settings, where{" "}
              <strong className="font-semibold">Create calendar feed</strong>{" "}
              gives you the link to subscribe to. It runs one way only: your
              plans appear in your calendar, and nothing you do in your calendar
              comes back.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("journal")}>
            <p>
              <Go tripId={tripId} segment="journal">
                Journal
              </Go>{" "}
              is a few lines a day while you&rsquo;re away. Each traveller writes
              their own entry per day: a short note (500 characters) and one
              photo, and everyone on the trip sees them side by side, so two of
              you never write over each other.
            </p>
            <p>
              Write in the box on any day&rsquo;s page; the dashed{" "}
              <strong className="font-semibold">+</strong> tile adds your photo.
              The Journal tab gathers every day into one thread. It opens on the
              trip&rsquo;s first day and stays open, so a missed day can be
              caught up.
            </p>
            <p>
              For a Share link, turn on{" "}
              <strong className="font-semibold">Include journal</strong> in the
              trip&rsquo;s settings;{" "}
              <strong className="font-semibold">Keep off Share links</strong> on
              your entry for a day keeps that entry alone off them. Anyone
              else&rsquo;s entry for the same day still goes out.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("something-off")}>
            <p>
              You don&rsquo;t have to spot the problems yourself. The app reads
              the plan and raises a{" "}
              <strong className="font-semibold">flag</strong> when something
              looks wrong or missing. They collect on{" "}
              <Go tripId={tripId} segment="summary">
                Summary
              </Go>
              .
            </p>
            <p>What a flag can be:</p>
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
              A flag is always something you can do something about, and they come
              in two strengths. Amber is the loud one: the app thinks this wants
              fixing. Blue is just for information, worth knowing but not a
              problem. The Summary lists the amber ones first; flags themselves
              are only ever amber or blue. A flag is never red, a nudge rather
              than a failure. But the app does turn red when the plan runs past
              the day you have to be home: that shows on the Plan, again in the
              Make it fit dialog, and as an{" "}
              <strong className="font-semibold">Runs over</strong> badge
              when you compare plans. (Red shows up elsewhere too, wherever
              something&rsquo;s about to be deleted or a form has a problem.
              It&rsquo;s not saved just for flags.)
            </p>
            <p>
              Once your trip has dates, and up until the day you set off, the
              trip&rsquo;s Home screen carries the same information as{" "}
              <strong className="font-semibold">Next steps</strong> (on a wide
              screen it&rsquo;s called{" "}
              <strong className="font-semibold">Sort these out</strong>): a short
              ranked list of what to deal with next, mixing the flags in with
              gentler nudges like places that still have no dates or a packing
              list you haven&rsquo;t started. Each line takes you to the screen
              where you fix it. When the list is empty, you really are done.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("account")}>
            <p>
              <SiteLink href="/account">Account</SiteLink> is the one page about
              you rather than a trip. Open it from the menu behind your picture,
              or, on a phone away from a trip, the{" "}
              <strong className="font-semibold">You</strong> tab.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Change photo</strong> sets your
                Profile photo.{" "}
                <strong className="font-semibold">Reposition</strong> lets you
                tap or drag to the part to keep in view, its focus point, so
                the small circle shows your face.
              </li>
              <li>
                <strong className="font-semibold">Display name</strong> is what
                the others see.
              </li>
              <li>
                <strong className="font-semibold">Devices</strong> lists every
                phone and computer set up for the morning and evening
                digests;{" "}
                <strong className="font-semibold">Enable on this device</strong>{" "}
                adds the one in your hand.
              </li>
              <li>
                <strong className="font-semibold">
                  Which trips send you a digest
                </strong>{" "}
                has a switch per trip.
              </li>
            </ul>
          </Section>

          <Section heading={Sub} section={sectionById("feedback")}>
            <p>
              Something wrong, or wish it worked differently? The round
              speech-bubble button in the bottom-right corner of every screen
              opens <strong className="font-semibold">Feedback</strong>. On a
              phone it sits just above the bar along the bottom. Type into{" "}
              <strong className="font-semibold">What&rsquo;s on your mind?</strong>{" "}
              and tap <strong className="font-semibold">Send</strong>. It notes
              which screen you were on, so you needn&rsquo;t explain where.
            </p>
            <p>
              Your notes are private to you and me, and
              they stay listed in the panel. Once one is sorted it&rsquo;s
              crossed out and marked{" "}
              <strong className="font-semibold">Done</strong>, or{" "}
              <strong className="font-semibold">Won&rsquo;t fix</strong> if
              I&rsquo;ve decided against it. Written with no signal? It shows
              as <strong className="font-semibold">Pending</strong> and sends
              itself once you&rsquo;re back online. The bin beside a note
              removes it.
            </p>
          </Section>
        </div>
      </section>

      {/* ── Advanced ── */}
      <section aria-labelledby="help-advanced-heading">
        <Group id="help-advanced-heading" className={GROUP_HEADING}>
          {HELP_GROUP_LABELS.advanced}
        </Group>
        <p className="mb-3.5 mt-1 text-[13px] font-medium text-muted-foreground">
          None of this is needed to plan a trip. Come back when you&rsquo;re
          curious.
        </p>
        <div data-slot="help-topic-grid" className={TOPIC_GRID}>
          {/* One <Section> per advanced id. */}
          <Section heading={Sub} section={sectionById("chapters")}>
            <p>
              Chapters are off to begin with, so if you&rsquo;ve never turned
              them on this whole section is about something you won&rsquo;t see
              yet. In{" "}
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>
              , switch on{" "}
              <strong className="font-semibold">Group this trip into chapters</strong>.
              Switch it off again when you&rsquo;ve had enough of them. Your
              bands aren&rsquo;t thrown away, they just stop showing. Switch them back on and they come
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
              can rename and redraw them freely afterwards. A suggestion is only
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
              a rough number of nights, with no dates at all: a sketch.{" "}
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
              to five and the places after it shift along to make room, but
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
              on the spot (a message telling you the pin was kept) rather than
              quietly overwriting the booking, and any slack left in front of a
              pin simply sits there as free days.
            </p>
            <p>
              The reverse of firming up makes a place rough again so you can go
              back to sketching it: it&rsquo;s{" "}
              <strong className="font-semibold">Make rough</strong> in the
              place&rsquo;s ⋯ menu, which clears its dates.
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
                <strong className="font-semibold">Trim nights</strong>: take
                nights off the places that aren&rsquo;t pinned, split in
                proportion to how long you&rsquo;re staying at each. What it
                suggests never takes a place below one night, but the numbers are
                yours to edit, so you can shuffle which place gives up what, and
                take one down to nothing, before you commit.
              </li>
              <li>
                <strong className="font-semibold">Or drop a stop</strong>: take
                one place out altogether. Each candidate shows the day the plan
                would
                then end on, so you can see which one actually closes the gap.
              </li>
            </ul>
            <p>
              Pinned places are never trimmed and never dropped. And nothing at
              all changes until you tap{" "}
              <strong className="font-semibold">Apply trim</strong> or confirm a
              drop. Everything before that is a preview you can walk away from.
            </p>
            <p>
              If trimming everything to the bone still won&rsquo;t reach the
              date, it says so plainly and points you at the three real options:
              drop a place, unpin one, or move the day you have to be home.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("forks")}>
            <p>
              A <strong className="font-semibold">what-if plan</strong> is a
              second version of the plan, kept beside the real one. Italy
              first, or Switzerland bolted on the end? What-if plans are off
              by default: turn on{" "}
              <strong className="font-semibold">What-if plans</strong> in the
              trip&rsquo;s Settings first. Then, up in the trip header, next
              to the member avatars and the notification bell, there&rsquo;s
              a dropdown for this. Open it and tap{" "}
              <strong className="font-semibold">New what-if plan</strong> to
              get one of each to look at side by side instead of arguing in
              the abstract. It stays with you across the Plan, Money and the
              Wishlist, the screens that follow the what-if plan you&rsquo;re
              editing. Everywhere else, including every dated screen, keeps
              showing the real plan, and the switcher steps aside altogether
              once you&rsquo;re travelling or the trip is over. (You&rsquo;ll
              see this called a Fork in the code, same thing.)
            </p>
            <p>
              A what-if plan is a full plan, not a sketch. You edit it with
              exactly the same tools, and it gets its own dates, its own
              flags and its own total. While you&rsquo;re in one, a banner
              along the top says{" "}
              <strong className="font-semibold">Editing what-if plan</strong>,
              names the one you&rsquo;re in, and tells you it isn&rsquo;t
              live, your calendar, summary and sharing still follow your real
              plan. That&rsquo;s the whole point: editing a what-if plan
              never touches the real plan, the dated screens, the{" "}
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
              what-if plan as a difference against it: which places were
              added, dropped, re-nighted or reordered, and how the end date,
              the total and the number of flags move.
            </p>
            <p>
              When you&rsquo;ve decided,{" "}
              <strong className="font-semibold">Make this the real plan</strong>{" "}
              makes that what-if plan the real plan, and discards every other
              one, including the one it replaces. It can&rsquo;t be undone,
              so the confirmation spells out what the swap would remove:
              payments you&rsquo;ve recorded, confirmation numbers, and files
              attached to the plan being replaced. Read that list before you
              tap it.
            </p>
            <p>
              What-if plans are only offered before you leave. Once the trip
              is under way there&rsquo;s nothing left to compare.
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
              note about why you saved it. In two years&rsquo; time
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
              one in takes a <strong className="font-semibold">copy</strong>:
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
              is the housekeeping. You&rsquo;ll open it a handful of times and
              then forget it exists. Where it sits depends on your screen:
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">On a wide screen</strong>, the
                list down the side has every section of the trip, in three
                groups: <strong className="font-semibold">Plan it</strong> (Home,
                Plan, Days, Calendar, Money, Wishlist),{" "}
                <strong className="font-semibold">Keep</strong> (Journal,
                Checklists, Files, Summary, Activity), then Settings and Help.
                Trips and Globe sit under{" "}
                <strong className="font-semibold">Across trips</strong>.
              </li>
              <li>
                <strong className="font-semibold">On a narrower window</strong>,
                the strip down the side keeps Home, Plan, Days, Calendar, Money
                and Wishlist, and{" "}
                <strong className="font-semibold">More</strong> opens a page of
                tiles for the rest, Settings among them.
              </li>
              <li>
                <strong className="font-semibold">On a phone</strong>, the bar
                along the bottom has Home, Plan, Days and Money, and{" "}
                <strong className="font-semibold">More</strong> opens a sheet
                with everything else.
              </li>
            </ul>
            <p>
              <strong className="font-semibold">Travellers</strong> is who can
              see the trip.{" "}
              <strong className="font-semibold">Add a traveller by email</strong>{" "}
              names the person you want on it. Nothing is sent to them. The
              invite simply sits there marked{" "}
              <strong className="font-semibold">Pending</strong>, and turns into
              real access the next time they sign in with that address. Tell
              them yourself, in other words. You can cancel one while
              it&rsquo;s still pending.
            </p>
            <p>
              <strong className="font-semibold">New share link</strong> is the
              other way to let someone see the trip: a read-only page for
              people who aren&rsquo;t planning it with you, a parent who wants
              to know where you&rsquo;ll be. Give each one a label (who it&rsquo;s
              for) and choose what it shows: Accommodation, Transport, Daily
              plans. Route and dates are always included, and costs, notes
              and booking confirmations are never shared on any link, whatever
              you tick.{" "}
              <strong className="font-semibold">Include journal</strong> adds
              each day&rsquo;s Journal notes and photos, by first name, and is
              off until you turn it on;{" "}
              <strong className="font-semibold">Show who&rsquo;s going</strong>{" "}
              puts everyone&rsquo;s names and photos on the page. Once the trip
              is over, the page offers whoever&rsquo;s reading it{" "}
              <strong className="font-semibold">Use this route</strong>, which
              starts a trip of their own with the same stops: just the places
              and nights, never your dates, stays or Journal. Make as many
              links as you like, one per audience, and{" "}
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
              At the bottom, in red, are the two that can&rsquo;t be taken back.
              Only the person who created the trip sees them.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Duplicate</strong> starts a
                brand-new trip from this one&rsquo;s bones: the same places,
                chapters, wishlist and checklists, and the legs that join the
                places up, stripped back to just the mode. Every date is wiped,
                ready to sketch again. Give it a{" "}
                <strong className="font-semibold">Name for the duplicate</strong>{" "}
                and you&rsquo;re done. The trip you copied isn&rsquo;t touched.
                Your co-travellers aren&rsquo;t added automatically. Each one
                gets invited to the duplicate and joins once they accept.
              </li>
              <li>
                <strong className="font-semibold">Delete trip</strong> moves
                it and everything in it: every place, every thing to do, every
                cost and payment, the checklists, the journal, and the files
                you&rsquo;ve uploaded, into{" "}
                <strong className="font-semibold">Recently deleted</strong> on
                your Trips page. It asks you to type the trip&rsquo;s name
                first, and then{" "}
                <strong className="font-semibold">Delete</strong> confirms it.
                You have 30 days to tap{" "}
                <strong className="font-semibold">Restore</strong> there and
                get it back exactly as it was; after that it&rsquo;s gone for
                good.
              </li>
            </ul>
          </Section>

          <Section heading={Sub} section={sectionById("links")}>
            <p>
              A trip&rsquo;s address reads like its name: Autumn in Kyoto lives
              at{" "}
              <span className="font-mono text-[13px]">/trips/autumn-in-kyoto</span>
              , with its screens and days hanging off that. Copy a link from the
              address bar on any screen, down to a single day, and it says where
              it goes.
            </p>
            <p>
              Rename the trip and the address follows, while every old one (the
              long jumbled ones from before included) still lands in the same
              place.
            </p>
            <p>
              Only people on the trip can open these links; anyone else is told
              the page isn&rsquo;t there. For someone who isn&rsquo;t on it, make
              a Share link in{" "}
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>
              . Its address never changes with a rename.
            </p>
          </Section>

          <Section heading={Sub} section={sectionById("home-screen")}>
            <p>
              Teepee is a website that installs like an app. From your Home Screen
              it opens full-screen, keeps the trips you&rsquo;ve saved for offline
              with you, and on an iPhone it is the only way the Digest can reach
              you.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Android</strong>: Chrome offers{" "}
                <strong className="font-semibold">Install</strong>: on the card
                Teepee shows on your trips page, or from the browser menu under{" "}
                <strong className="font-semibold">Add to Home screen</strong>.
              </li>
              <li>
                <strong className="font-semibold">iPhone</strong>: in Safari, tap{" "}
                <strong className="font-semibold">Share</strong>, then{" "}
                <strong className="font-semibold">Add to Home Screen</strong>, then
                open Teepee from there.
              </li>
            </ul>
            <p>
              Dismissed the card on your trips page? These steps are the same,
              whenever you&rsquo;re ready.
            </p>
          </Section>
        </div>
      </section>

      {/* ── Reference ── */}
      <section aria-labelledby="help-reference-heading">
        <Group id="help-reference-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          {HELP_GROUP_LABELS.reference}
        </Group>
        <div data-slot="help-topic-grid" className={TOPIC_GRID}>
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
                  is a run of stops in order.
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
                  with no date yet, or be given a day and land on Calendar.
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
                  How keen you are on a Wishlist idea: Must, Keen or Meh, so
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
                  It can be a flight, train, bus, car or ferry, and anything
                  that isn&rsquo;t one of those goes under Other.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Cost</dt>
                <dd className="text-muted-foreground">
                  What something costs: your best number while you&rsquo;re
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
                  Something the app noticed and thinks you should fix: a
                  missing booking, an impossible day. Always actionable.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Next steps</dt>
                <dd className="text-muted-foreground">
                  The ranked list of what to deal with next (flags plus gentler
                  nudges) on the trip&rsquo;s Home screen while you&rsquo;re
                  still planning. Called Sort these out on a wide screen.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">What-if plan</dt>
                <dd className="text-muted-foreground">
                  A second version of the plan, kept beside the real one for
                  comparison, not live until you make it the real plan. Called
                  a Fork in the code.
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
                  A place with a number of nights but no dates yet: the sketch
                  stage.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Firm up</dt>
                <dd className="text-muted-foreground">
                  Turning rough places into real dates by flowing the nights
                  forward: from the trip&rsquo;s start, or from where the place
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
