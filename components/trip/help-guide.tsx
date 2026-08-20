import * as React from "react";
import { ChevronRight } from "lucide-react";
import { HelpLegend } from "@/components/trip/help-legend";
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
 * Print CSS: expand every section so a printout is complete.
 *
 * Two rules are needed because engines disagree on how a closed <details>
 * hides its content. Older engines set `display: none` on the children, so
 * overriding their `display` is enough. Chromium >= 131, Safari >= 18.4 and
 * Firefox >= 139 instead put the content in a `::details-content` box with
 * `content-visibility: hidden`, where the children's own `display` is
 * irrelevant — those need the second rule. Keep both.
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

/** One collapsible section. */
function Section({
  section,
  children,
}: {
  section: HelpSection;
  children: React.ReactNode;
}) {
  return (
    <details
      id={section.id}
      className="group rounded-xl border border-border bg-card px-4 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-base font-semibold text-foreground">
            {section.title}
          </span>
          <span className="text-sm text-muted-foreground">{section.blurb}</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-foreground">
        {children}
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

export function HelpGuide({ tripId }: { tripId?: string }) {
  return (
    <div className="flex flex-col gap-8">
      <style>{HELP_PRINT_STYLE}</style>

      {/* ── Always-visible key ── */}
      <section aria-labelledby="help-legend-heading">
        <h2
          id="help-legend-heading"
          className="mb-4 font-display text-xl font-bold text-foreground"
        >
          What the buttons mean
        </h2>
        <HelpLegend />
      </section>

      {/* ── Everyday sections ── */}
      <section aria-labelledby="help-everyday-heading">
        <h2
          id="help-everyday-heading"
          className="mb-4 font-display text-xl font-bold text-foreground"
        >
          Using it day to day
        </h2>
        <div className="flex flex-col gap-3">
          {/* One <Section> per everyday id, in HELP_SECTIONS order. */}
          <Section section={sectionById("sixty-seconds")}>
            <p>
              The whole app is one loop. Six steps, and you have a planned trip.
            </p>
            <ol className={`list-decimal ${LIST_CLASS}`}>
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
                Give each one a day on the{" "}
                <Go tripId={tripId} segment="calendar">
                  Calendar
                </Go>
                . This is the step everyone forgets — the next two sections are
                all about it.
              </li>
              <li>
                Put a number against anything that costs money, then watch the
                running total on{" "}
                <Go tripId={tripId} segment="budget">
                  Budget
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
            <p>
              You can stop anywhere in that loop and come back later. Nothing has
              to be finished, everything saves as you go, and the other one of you
              picks up your changes the next time they open the screen.
            </p>
          </Section>

          <Section section={sectionById("trip-shape")}>
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
              It reads top to bottom, in the order you&rsquo;ll travel. Three
              things make up the shape:
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">A Stop</strong> — a place
                you&rsquo;re based for a few nights. Each one is a card showing
                its dates and how many nights you&rsquo;re there.
              </li>
              <li>
                <strong className="font-semibold">A Chapter</strong> — a coloured
                band grouping a stretch of the trip into one piece, the way
                you&rsquo;d talk about &ldquo;the Italy bit&rdquo;. It sits over
                a run of days; the places inside it are still ordinary Stops.
              </li>
              <li>
                <strong className="font-semibold">The Home base</strong> — where
                you set off from. It shows as a card above the first place and,
                if you&rsquo;re coming home again, below the last one, so the
                plan reads out from home and back to it.
              </li>
            </ul>
            <p>
              In the gaps between the Stop cards you&rsquo;ll find the flights,
              trains and drives that join them. Inside each card you&rsquo;ll
              find where you&rsquo;re sleeping and the things you&rsquo;ve
              planned to do there.
            </p>
          </Section>

          <Section section={sectionById("things-to-do")}>
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
                the colour it shows in and how it&rsquo;s grouped on the Budget.
              </li>
              <li>
                <strong className="font-semibold">Date</strong> — leave this
                blank for now, and read the box below before you fill it in.
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
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
            >
              <strong className="font-semibold">Worth knowing:</strong> a thing
              to do won&rsquo;t show up on the{" "}
              <Go tripId={tripId} segment="calendar">
                Calendar
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

          <Section section={sectionById("giving-a-day")}>
            <p>
              Giving something a day is what puts it on the{" "}
              <Go tripId={tripId} segment="calendar">
                Calendar
              </Go>
              , on that day&rsquo;s own page, and on the screen you&rsquo;ll live
              off while you&rsquo;re travelling. Two routes move something
              you&rsquo;ve already got onto a day; the third is for putting
              something new straight onto one.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">From the plan.</strong> Tap the
                pencil next to the thing and fill in{" "}
                <strong className="font-semibold">Date</strong>. That&rsquo;s the
                whole job.
              </li>
              <li>
                <strong className="font-semibold">From the Calendar.</strong> The
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
                underneath on a phone. Drag an idea onto a day and it{" "}
                <strong className="font-semibold">moves</strong> there: the idea
                now has that date, so it leaves the board. If you&rsquo;d rather keep it on the board, tap the
                little calendar button beside it instead — that puts a copy on
                the day and leaves the idea where it is.
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

          <Section section={sectionById("undecided")}>
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
              appears up at the top of the board. A Globe is an
              everywhere-someday map shared across all your trips, not just this
              one. Each place on it is a{" "}
              <strong className="font-semibold">Marker</strong>, and Markers stay
              put: pulling one in copies it into this trip&rsquo;s Wishlist. The
              board also suggests Markers near where this trip is going, so you
              don&rsquo;t have to remember what you saved two years ago.
            </p>
            <p>
              One thing that catches people out: there are two ways an idea gets
              onto a day, and they behave differently.{" "}
              <strong className="font-semibold">Schedule this</strong> on an
              idea&rsquo;s card — and the little calendar button on the Wishlist
              column beside the Calendar — puts a{" "}
              <strong className="font-semibold">copy</strong> on the day you
              pick. The idea itself stays on the board, now with a tick and{" "}
              &ldquo;in this plan&rdquo; beside it. That&rsquo;s the one to reach
              for, because the Wishlist is shared by every version of the plan,
              so the same idea can sit on day three of one and day five of
              another. Dragging an idea onto a day instead{" "}
              <strong className="font-semibold">moves</strong> it: the idea takes
              that date, so it leaves the board and gets no tick. It isn&rsquo;t
              lost — it&rsquo;s on the day you dropped it on.
            </p>
          </Section>

          <Section section={sectionById("sleeping-moving")}>
            <p>
              Two more things hang off the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              , and both live on the Stop cards rather than the Calendar.
            </p>
            <p>
              <strong className="font-semibold">Accommodation</strong> is where
              you sleep. Tap{" "}
              <strong className="font-semibold">Add Accommodation</strong> on a
              place&rsquo;s card and fill in the check-in and check-out dates,
              the address, and the confirmation number off the booking email. The
              app checks those dates against your nights there, so a night with
              nowhere booked gets pointed out rather than discovered.
            </p>
            <p>
              <strong className="font-semibold">Transport</strong> is how you get
              from one place to the next — flight, train, drive, ferry, whatever
              it is. The{" "}
              <strong className="font-semibold">Add transport</strong> buttons
              sit in the gaps between the Stop cards, so the leg you&rsquo;re
              adding is the one you&rsquo;re looking at. Record the mode, where
              and when it leaves and arrives, and the flight or train number.
            </p>
            <p>
              Both of them take a{" "}
              <strong className="font-semibold">Cost</strong> in the same form,
              so you never have to go somewhere else to write down what the hotel
              came to.
            </p>
          </Section>

          <Section section={sectionById("money")}>
            <p>
              Anything that costs money carries two numbers, and they mean
              different things. Getting this straight makes the whole of{" "}
              <Go tripId={tripId} segment="budget">
                Budget
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
                Budget
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

          <Section section={sectionById("getting-ready")}>
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
              attach a file directly to a place, a booking or a thing to do —
              the paperclip button sits on every card, so it&rsquo;s the number
              next to it that
              tells you something&rsquo;s attached — and it turns up here as
              well.
            </p>
          </Section>

          <Section section={sectionById("together")}>
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
              shows the most recent changes from both of you. Reading it clears
              the count.
            </p>
          </Section>

          <Section section={sectionById("away")}>
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

          <Section section={sectionById("something-off")}>
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
        <h2
          id="help-advanced-heading"
          className="mb-2 font-display text-xl font-bold text-foreground"
        >
          Going deeper
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          None of this is needed to plan a trip. Come back when you&rsquo;re
          curious.
        </p>
        <div className="flex flex-col gap-3">
          {/* One <Section> per advanced id. */}
          <Section section={sectionById("chapters")}>
            <p>
              A <strong className="font-semibold">Chapter</strong> is a coloured
              band over a stretch of dates. It gives you something to group by:
              the plan, the{" "}
              <Go tripId={tripId} segment="budget">
                Budget
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
              Two shortcuts on the{" "}
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
              from, and on the Budget it sits on its own{" "}
              <strong className="font-semibold">Between legs</strong> line rather
              than being counted inside either band&rsquo;s total.
            </p>
            <p>
              While a stretch has no dates yet, a Chapter works differently: you
              drag places into it by hand. The moment those places get dates it
              becomes an ordinary band and dates take over.
            </p>
          </Section>

          <Section section={sectionById("dates-and-pins")}>
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
              Nothing is locked afterwards. Change one place from three nights to
              five and everything after it shifts along by two — the ripple. It
              is the same engine that re-dates the plan when you drag a place
              into a different position, which is why you don&rsquo;t have to
              clear dates before reordering.
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

          <Section section={sectionById("make-it-fit")}>
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

          <Section section={sectionById("forks")}>
            <p>
              A <strong className="font-semibold">variant</strong> is a second
              version of the plan, kept beside the real one. Italy first, or
              Switzerland bolted on the end? Up in the trip header, next to the
              member avatars and the notification bell, there&rsquo;s a dropdown
              for this — open it and tap{" "}
              <strong className="font-semibold">New variant</strong> to get one
              of each to look at side by side instead of arguing in the
              abstract. It travels with you across every screen on the trip,
              though it steps aside once you&rsquo;re travelling or the trip is
              over. (You&rsquo;ll see this called a Fork here and there — same
              thing.)
            </p>
            <p>
              A variant is a full plan, not a sketch. You edit it with exactly the
              same tools, and it gets its own dates, its own Flags and its own
              total. While you&rsquo;re in one, a banner along the top says{" "}
              <strong className="font-semibold">
                Editing variant &mdash; not live
              </strong>
              , and that&rsquo;s the whole point: editing a variant never touches
              the real plan, the dated screens, the{" "}
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
        </div>
      </section>

      {/* ── Reference ── */}
      <section aria-labelledby="help-reference-heading">
        <h2
          id="help-reference-heading"
          className="mb-4 font-display text-xl font-bold text-foreground"
        >
          Looking something up
        </h2>
        <div className="flex flex-col gap-3">
          {/* The word-list section. */}
          <Section section={sectionById("word-list")}>
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
                  with no date yet, or be given a day and land on the Calendar.
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
                  A flight, train, drive or ferry between two places, with times
                  and a reference number.
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
                  forward from where the trip starts.
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
