import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Teepee collects, who it shares it with, and how long it keeps it.",
};

/**
 * Public and unauthenticated — TEEPEE's OAuth consent screen links here, and
 * the person reading it is exactly the person who cannot yet sign in. Sits
 * outside the (app) route group (same as the Landing) so it never hits the
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
 *   - lib/push.ts, lib/geocode.ts (Nominatim and Photon, ADR 0069), lib/map-tiles.ts, lib/storage.ts,
 *     lib/weather.ts, lib/fx.ts (outbound third parties)
 *   - components/analytics.tsx + app/layout.tsx (Vercel Web Analytics and Speed Insights — what
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
 *
 * 2026-10-08 (spec §F, §H): rewritten in the maintainer's own voice ("I"),
 * plain sentences, no em-dashes. Every fact above was carried over; the
 * tests pin each one. "Admin" stays only where it names the role (every
 * Admin's device, the Admin queue, what only an Admin can see).
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro={
        <>
          I run Teepee, an invite-only trip planner, for a small group of
          friends and family. This page says what it collects about you,
          who else sees it, and how long it is kept. If anything here is
          unclear, ask me.
        </>
      }
      other={{ href: "/terms", label: "Terms" }}
    >
      <LegalSection title="What Teepee collects">
        <ul>
          <li>
            <span className="font-bold">
              Your sign-in details.
            </span>{" "}
            If you sign in with Google, Teepee gets your name, email
            address and avatar image from Google. It also stores the OAuth
            tokens Google issues for your session: the access token, refresh
            token, ID token, the granted scope, and a session token that
            identifies your browser. If you use a sign-in link, Teepee
            stores the email address you typed, sends one email to it
            through Resend, and keeps a one-use sign-in token that expires
            after a day. The account it creates holds only that address.
          </li>
          <li>
            <span className="font-bold">
              Everything you put in a trip.
            </span>{" "}
            The stops, transport, accommodation, items, costs, notes,
            journal entries and checklists that you and the other travellers
            on a trip enter.
          </li>
          <li>
            <span className="font-bold">
              Your Globe.
            </span>{" "}
            Markers for places you, and anyone who shares your Globe, want
            to visit someday. The Globe belongs to your account and is kept
            apart from any trip.
          </li>
          <li>
            <span className="font-bold">
              A record of changes to a trip.
            </span>{" "}
            When someone creates, changes or deletes a stop, item,
            transport, accommodation, chapter or cost, or leaves a note, it
            is logged as an activity: who did it, when, and for a change,
            which fields went from what to what. This is the trip&apos;s
            shared history. The travellers on that trip can see it.
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
            If you turn on the Digest on a device, Teepee stores what that
            device&apos;s browser gives it to deliver a push notification.
            It also stores a rough device type (&quot;iPhone&quot;,
            &quot;Mac&quot; and so on, worked out once from the
            browser&apos;s user agent and never anything more specific), the
            timezone that device last reported, and when it was last seen.
          </li>
          <li>
            <span className="font-bold">
              Error reports.
            </span>{" "}
            When something in Teepee breaks, including a failure caught in
            your browser, it records the error message, a stack trace, the
            route it happened on, and your account id if you were signed in
            at the time. The error is also written to Vercel&apos;s own
            runtime logs. The first time a given server-side failure is
            seen, its raw error message is pushed to each Admin&apos;s
            device, if they have one registered. A repeat of the same
            failure only bumps a count and is never pushed again. A failure
            reported by a browser is never pushed this way at all.
          </li>
          <li>
            <span className="font-bold">
              Access requests, including from people who never get an
              account.
            </span>{" "}
            Teepee is invite-only. If you try to sign in, with Google or by
            asking for a sign-in link, and your address is not on the
            invite list, sign-in is refused and no link is sent. The
            refusal itself is recorded: your email, how many times
            you&apos;ve tried, and, from Google, your name and avatar. That
            way I can see who has asked and decide whether to invite them.
            So Teepee can hold a record about you even if you are never
            granted an account. I can approve a request, which grants
            access, or dismiss it. A dismissed request is closed for good.
            It does not come back to the Admin queue, even if you sign in
            again.
          </li>
          <li>
            <span className="font-bold">
              Feedback notes.
            </span>{" "}
            A note you write to me about Teepee itself (a bug, an
            annoyance, a suggestion) carries the note text and where it was
            written: the route, a page label, the trip you were viewing (if
            any), your browser&apos;s viewport size and user agent, and your
            name. In the app you see only your own notes. Only an Admin sees
            everyone&apos;s.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Who it is shared with">
        <p>
          Nothing in Teepee is sold, and nothing is shared for marketing.
          These are the services Teepee&apos;s code contacts:
        </p>
        <ul>
          <li>
            <span className="font-bold">Google</span>: sign-in. Your avatar
            image is also loaded straight from Google by whoever&apos;s
            browser is showing it, so Google sees that request too, apart
            from sign-in.
          </li>
          <li>
            <span className="font-bold">
              Apple Push and FCM (Firebase Cloud Messaging)
            </span>
            : deliver the Digest and other push notifications to your
            devices.
          </li>
          <li>
            <span className="font-bold">
              OpenStreetMap (Nominatim), Photon (komoot) and CARTO
            </span>
            : turn place names you type into map coordinates (Photon for
            as-you-type search, Nominatim when a place is saved), and draw
            the map tiles you see on the Summary, the Globe and the Day
            map.
          </li>
          <li>
            <span className="font-bold">
              Open-Meteo
            </span>
            : a stop&apos;s coordinates and a day&apos;s date, sent to get a
            weather forecast. For a date too far out to forecast, it gives a
            typical reading from the same calendar date last year.
          </li>
          <li>
            <span className="font-bold">
              Frankfurter
            </span>
            : currency codes (for example &quot;AUD&quot; → &quot;EUR&quot;),
            sent to get an exchange rate. Only the currency pair is sent,
            with no trip content.
          </li>
          <li>
            <span className="font-bold">Resend</span>: sends the sign-in
            link email. It sees the address the email goes to and the link
            inside it.
          </li>
          <li>
            <span className="font-bold">
              Anthropic (Claude), an optional AI assist.
            </span>{" "}
            It is off unless I turn it on. Teepee has an AI assist for three
            things: suggesting activities, drafting a packing list, and
            turning a pasted booking confirmation into a transport or
            accommodation entry. It only runs if I have set an API key for
            it. That is a deployment setting, so it can be switched on or
            off without any change to this page. When it is on, Teepee
            sends: a stop&apos;s name and country, plus the titles of the
            items already on that stop (so it doesn&apos;t repeat them), for
            a suggestion; the trip name with its stops and dates, for a
            packing list; or, for parsing, the entire text you paste in.
            That can include names, addresses and booking or confirmation
            numbers, since it is whatever you pasted.
          </li>
          <li>
            <span className="font-bold">
              Cloudflare R2
            </span>
            : stores uploaded attachments and trip cover images.
          </li>
          <li>
            <span className="font-bold">Vercel</span>: hosts the app, runs
            the database migration on a production deploy, and runs the Web
            Analytics and Speed Insights described below.
          </li>
          <li>
            <span className="font-bold">Neon</span>: hosts the database.
          </li>
          <li>
            <span className="font-bold">GitHub</span>: the nightly database
            backup (see &quot;How long it is kept&quot; below) is uploaded to
            GitHub as a GitHub Actions build artifact and stored there for
            up to 30 days. It is a complete copy of the database, with every
            trip, note, email address, access request and error report in
            it. Who can download a GitHub Actions artifact is exactly who
            can read the repository it belongs to. That setting lives on
            GitHub, not in Teepee, and I can tell you what it is today.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Analytics, advertising and trackers">
        <p>
          Teepee has no advertising and no ad-tech trackers. There is no
          cross-site tracking, no ad targeting and no data broker, and
          nothing is sold.
        </p>
        <p>
          Teepee uses{" "}
          <span className="font-bold">
            Vercel Web Analytics
          </span>{" "}
          (part of the Vercel hosting above) to count page views in
          aggregate: which pages get opened, on what kind of device, plus
          the referrer and a rough country. Vercel&apos;s own
          infrastructure adds those details. None of it is read from your
          account. It uses no cookies and builds no personal profile.
        </p>
        <p>
          Teepee also uses{" "}
          <span className="font-bold">Vercel Speed Insights</span> (part
          of the same hosting) to measure how quickly pages load and
          respond on real devices. It gets the page address, the kind of
          device and the timings. That is page timing only, no trip
          content.
        </p>
        <p>
          A share link&apos;s address carries a secret token, so that token
          is stripped before the page view is sent to analytics, and before
          a page timing is sent to Speed Insights. It still appears,
          unredacted, in an error report if that page happens to throw
          (see &quot;What Teepee collects&quot; above).
        </p>
        <p>
          A trip&apos;s id in an address like <code>/trips/…</code> is left
          in the analytics on purpose, so usage can be broken down per
          trip. A trip id is useless to anyone without an account on that
          trip. Beyond those page views and page timings, there is no other
          analytics.
        </p>
      </LegalSection>

      <LegalSection title="How long it is kept">
        <ul>
          <li>
            <span className="font-bold">
              Database backups
            </span>{" "}
            run nightly, so there is a way back if a bug or a bad migration
            damages data. Each one is held on GitHub for up to 30 days as a
            build artifact. During that window I also copy it to storage
            outside GitHub. This page makes no claim about how long that
            separate copy is kept.
          </li>
          <li>
            <span className="font-bold">
              Deleted files
            </span>{" "}
            are kept for at least 35 days after you delete them, so they
            still exist in any backup taken before the deletion. After that
            they are removed the next time I run the cleanup. There is no
            scheduled job that does this on its own.
          </li>
          <li>
            <span className="font-bold">
              Error reports and access requests
            </span>{" "}
            are not deleted on a timer. An Admin can clear an error report
            once it is understood, and approve or dismiss an access request.
            Until then, both sit in the database (and so in the nightly
            backups above) like everything else.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Getting your data">
        <p>
          There is no self-serve export yet. Ask me and I&apos;ll send you a
          copy.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
