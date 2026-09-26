import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Teepee collects, who it shares it with, and how long it keeps it.",
};

/**
 * Public and unauthenticated — TEEPEE's OAuth consent screen links here, and
 * the person reading it is exactly the person who cannot yet sign in. Sits
 * outside the (app) route group (same as /signin) so it never hits the
 * authenticated layout's redirect.
 *
 * Every claim below is checked against the code, not assumed — fix round 1
 * corrected several over-claims found by a fact-check against:
 *   - lib/error-sink.ts, app/api/client-error/route.ts, app/global-error.tsx,
 *     lib/admin-notify.ts (error reports — what's stored, what's logged,
 *     what gets pushed)
 *   - lib/access-requests.ts, server/actions/access-requests.ts (access
 *     requests — dismiss is terminal, does not re-surface)
 *   - prisma/schema.prisma (PushSubscription, Activity, FeedbackNote,
 *     Account, Session field lists)
 *   - lib/device-label.ts (device label is derived from the user agent)
 *   - lib/push.ts, lib/geocode.ts, lib/map-tiles.ts, lib/storage.ts,
 *     lib/weather.ts, lib/fx.ts (outbound third parties)
 *   - components/analytics.tsx + app/layout.tsx (Vercel Web Analytics — what
 *     it redacts and what it deliberately keeps)
 *   - .github/workflows/db-backup.yml (GitHub holds the backups — no claim
 *     made here about who else can read a GitHub Actions artifact, since
 *     that depends on repo visibility, which lives outside this repo),
 *     lib/blob-retention.ts + scripts/sweep-deleted-blobs.ts (blob deletion
 *     is a manual sweep, not a scheduled job)
 *   - lib/ai.ts, server/actions/ai.ts, components/trip/ai-booking-parser.tsx,
 *     README.md's "AI (optional, paid)" step (Anthropic — env-gated on
 *     ANTHROPIC_API_KEY, off unless the Admin sets it, flippable without a
 *     code change — so this page describes the mechanism, not a snapshot of
 *     whether it happens to be on today)
 *   - vercel.json (the migration only runs when VERCEL_ENV=production)
 *   - lib/admin-notify.ts, lib/admin.ts (Admin push needs ADMIN_EMAILS set
 *     and only fires on a new error signature, never a repeat)
 *
 * Fix round 2 corrected: Anthropic undisclosed (and worded to survive the
 * on/off flip rather than assert either state); "private build artifact"
 * claimed a GitHub repo visibility this repo cannot confirm; the Admin push
 * and migration claims were both broader than the code; id_token was
 * missing from the OAuth token list; the GitHub-backup wording implied the
 * Admin's pull happens after the 30 days rather than during them; Globe
 * Markers were listed as Trip content when CONTEXT.md defines the Globe as
 * explicitly account-level, not Trip-owned.
 *
 * Fix round 3 corrected: the activity-suggestion payload was incomplete —
 * server/actions/ai.ts:51-55 loads every existing Item title on the Stop
 * and passes it as `existingTitles`, which lib/ai.ts:97-100 inlines
 * verbatim into the prompt ("Avoid suggesting: …") — Traveller-authored
 * content missing from a colon-introduced exhaustive list. The other two
 * AI paths were re-checked against server/actions/ai.ts line-by-line and
 * confirmed already accurate: aiDraftPackingList (:74-105) sends only
 * trip.name, trip.stops (name, country) and start/end date; aiParseBooking
 * (:117-134) sends only the pasted text itself, length-capped. Also added a
 * mechanism sentence on the GitHub artifact: who can download it is a repo
 * *visibility* setting on GitHub, invisible from this code (same shape as
 * the ANTHROPIC_API_KEY flip) — so the sentence states the mechanism
 * ("exactly who can read the repository") and points to the Admin, rather
 * than asserting private or public.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro={
        <>
          Teepee is an invite-only trip planner for a small group of
          Travellers, not a public product. This page describes, plainly
          and specifically, what it collects about you and why — not a
          legal document, just an accurate account of what the system
          actually does. The Admin (Teepee&apos;s operator) has read it and is
          the person to ask if anything here is unclear.
        </>
      }
      other={{ href: "/terms", label: "Terms" }}
    >
      <LegalSection title="What Teepee collects">
        <ul>
          <li>
            <span className="font-bold">
              Your Google profile and sign-in tokens.
            </span>{" "}
            Signing in is Google sign-in only, so Teepee receives your
            name, email address and avatar image from Google, and stores
            the OAuth tokens Google issues for your session (the access
            token, refresh token, ID token, the granted scope, and a
            session token identifying your browser).
          </li>
          <li>
            <span className="font-bold">
              Everything you put in a Trip.
            </span>{" "}
            Stops, Transport, Accommodation, Items, Costs, Notes, Journal
            entries and Checklists — the trip content you and the other
            Travellers on a Trip enter.
          </li>
          <li>
            <span className="font-bold">
              Your Globe.
            </span>{" "}
            Markers — places you and whoever shares your Globe want to
            visit someday. This lives separately from any Trip, at the
            account level, not as part of a Trip&apos;s content.
          </li>
          <li>
            <span className="font-bold">
              A record of changes to a Trip.
            </span>{" "}
            Creating, changing or deleting a Stop, Item, Transport,
            Accommodation, Chapter or Cost — or leaving a Note — is
            logged as an Activity: who did it, when, and for a change,
            which fields moved from what to what. This is the Trip&apos;s
            shared history, visible to the Travellers on that Trip.
          </li>
          <li>
            <span className="font-bold">
              Files you upload.
            </span>{" "}
            Attachments such as tickets, confirmations and screenshots.
          </li>
          <li>
            <span className="font-bold">
              Push subscriptions.
            </span>{" "}
            If you turn on the Digest on a Device, Teepee stores what
            that Device&apos;s browser gives it to deliver a push
            notification, plus a coarse device type (&quot;iPhone&quot;,
            &quot;Mac&quot;, and similar — derived once from the
            browser&apos;s user agent, never anything more specific), the
            timezone that Device last reported, and when it was last
            seen.
          </li>
          <li>
            <span className="font-bold">
              Error reports.
            </span>{" "}
            When something in Teepee breaks — including a failure caught
            in your browser — it records the error message, a stack
            trace, the route it happened on, and your account id if you
            were signed in at the time. It is also written to Vercel&apos;s
            own runtime logs. The first time a given server-side failure
            is seen, its raw error message is pushed to every Admin&apos;s
            Device (if the Admin has one registered) — a repeat of the
            same failure only bumps a count, never pushes again, and a
            browser-reported failure is never pushed this way at all.
          </li>
          <li>
            <span className="font-bold">
              Access requests — including from people who never get an
              account.
            </span>{" "}
            Teepee is invite-only: if you sign in with Google and your
            address is not on the invite list, sign-in is refused, and
            that refusal itself is recorded — your name, email, avatar,
            and how many times you&apos;ve tried, exactly as Google&apos;s
            sign-in flow supplies them — so the Admin can see who has
            asked and decide whether to invite them. This is the most
            surprising thing on this page, so we are saying it plainly:
            Teepee can hold a record about you even if you are never
            granted an account. The Admin can approve a request (granting
            access) or dismiss it; a dismissed request is closed for
            good — it does not return to the Admin&apos;s queue, even if
            you sign in again.
          </li>
          <li>
            <span className="font-bold">
              Feedback notes.
            </span>{" "}
            A remark you write to the Admin about Teepee itself (a
            defect, an annoyance, a suggestion) carries the note text
            plus the circumstances it was written in — the route, a page
            label, the Trip you were viewing (if any), your browser&apos;s
            viewport size and user agent, and your name. You see only
            your own notes in the app; only the Admin sees every author&apos;s
            notes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Who it is shared with">
        <p>
          Teepee is one small app, not an ad-funded product — nothing
          here is sold, and nothing is shared for marketing. The
          following named services are the ones Teepee&apos;s code actually
          contacts:
        </p>
        <ul>
          <li>
            <span className="font-bold">Google</span> —
            sign-in. Your avatar image is also loaded straight from
            Google by whoever&apos;s browser is viewing it, so Google sees
            that request too, separately from sign-in itself.
          </li>
          <li>
            <span className="font-bold">
              Apple Push and FCM (Firebase Cloud Messaging)
            </span>{" "}
            — deliver the Digest and other push notifications to your
            Devices.
          </li>
          <li>
            <span className="font-bold">
              OpenStreetMap (Nominatim) and CARTO
            </span>{" "}
            — turn place names you enter into map coordinates, and draw
            the map tiles you see on the Summary, the Globe and the Day
            map.
          </li>
          <li>
            <span className="font-bold">
              Open-Meteo
            </span>{" "}
            — a Stop&apos;s coordinates and a day&apos;s date, sent to fetch a
            weather forecast (or, for a date too far out to forecast, a
            typical reading from the same calendar date last year).
          </li>
          <li>
            <span className="font-bold">
              Frankfurter
            </span>{" "}
            — currency codes (e.g. &quot;AUD&quot; → &quot;EUR&quot;), sent to fetch an
            exchange rate. No Trip content, just the currency pair.
          </li>
          <li>
            <span className="font-bold">
              Anthropic (Claude) — an optional AI assist, off unless the
              Admin turns it on.
            </span>{" "}
            Teepee includes an AI assist for three things: suggesting
            activities, drafting a packing list, and parsing a pasted
            booking confirmation into a Transport or Accommodation. It
            only runs if the Admin has configured an API key for it —
            turning it on is a deployment setting, not a code change, so
            whether this is live can change without this page changing.
            When it is on, Teepee sends: a Stop&apos;s name and country, plus
            the titles of the Items already on that Stop (so it does not
            repeat them), for a suggestion; the Trip name with its Stops
            and dates, for a packing list; or, for parsing, the entire
            text you paste in — which can include names, addresses and
            booking or confirmation numbers, since it is whatever you
            pasted.
          </li>
          <li>
            <span className="font-bold">
              Cloudflare R2
            </span>{" "}
            — stores uploaded Attachments and Trip cover images.
          </li>
          <li>
            <span className="font-bold">Vercel</span> —
            hosts the app, runs the database migration on a production
            deploy, and runs the Web Analytics described below.
          </li>
          <li>
            <span className="font-bold">Neon</span> —
            hosts the database.
          </li>
          <li>
            <span className="font-bold">GitHub</span> —
            the nightly database backup described under &quot;How long it&apos;s
            kept&quot; below is uploaded to GitHub as a GitHub Actions build
            artifact and stored there for up to 30 days: a complete copy
            of the database — every Trip, Note, email address, Access
            request and Error report in it. Who can download a GitHub
            Actions artifact is exactly who can read the repository it
            belongs to. That setting lives on GitHub, not in Teepee, and
            the Admin can tell you what it is today.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Analytics, advertising and trackers">
        <p>
          There is no advertising in Teepee, and no third-party tracker
          in the ad-tech sense — no cross-site tracking, no ad targeting,
          no data broker, nothing sold. Teepee does use{" "}
          <span className="font-bold">
            Vercel Web Analytics
          </span>{" "}
          (part of the Vercel hosting above) for coarse, aggregate page
          views: which pages get opened, on what kind of device, plus
          referrer and coarse country — dimensions Vercel&apos;s own
          infrastructure adds, not anything read out of your account. It
          does not use cookies and does not build a personal profile.
          One redaction we do control: a Share link&apos;s URL carries a
          secret token as part of the address, so that token is stripped
          before the page view is sent to analytics — it still appears,
          unredacted, in an Error report if that specific page happens to
          throw (see &quot;What Teepee collects&quot; above). A Trip&apos;s id in a
          URL like <code>/trips/…</code> is deliberately not redacted
          from analytics, so usage can be broken down per Trip; a Trip id
          is useless to anyone without an account on that Trip. Beyond
          that one page-view counter, there is no other analytics.
        </p>
      </LegalSection>

      <LegalSection title="How long it is kept">
        <ul>
          <li>
            <span className="font-bold">
              Database backups
            </span>{" "}
            run nightly — the rollback path if a bug or a bad migration
            damages data. Each one is held on GitHub for up to 30 days as
            a build artifact. During that window the Admin also copies
            it to storage outside GitHub — this page makes no claim
            about how long that separate copy is kept.
          </li>
          <li>
            <span className="font-bold">
              Deleted files
            </span>{" "}
            are not destroyed the instant you delete them: they are kept
            at least 35 days (so they still exist in any backup taken
            before the deletion), then removed the next time the Admin
            runs the cleanup — there is no scheduled job that does this
            on its own.
          </li>
          <li>
            <span className="font-bold">
              Error reports and Access requests
            </span>{" "}
            are not deleted on a timer. An Admin can clear an error
            report once it is understood, and approve or dismiss an
            Access request — until then, both simply sit in the
            database (and so in the nightly backups above) like
            everything else.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Getting your data">
        <p>
          There is no self-serve export yet — ask the admin and
          they&apos;ll send you a copy.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
