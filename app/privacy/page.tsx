import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · TEEPEE",
  description: "What TEEPEE collects, who it shares it with, and how long it keeps it.",
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
 *   - .github/workflows/db-backup.yml (GitHub holds the backups),
 *     lib/blob-retention.ts + scripts/sweep-deleted-blobs.ts (blob deletion
 *     is a manual sweep, not a scheduled job)
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Link
            href="/signin"
            className="flex items-center gap-1.5 font-display text-lg font-semibold text-foreground"
          >
            <span aria-hidden="true">🛖</span>
            TEEPEE
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2 border-b border-border pb-6">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Privacy
            </h1>
            <p className="text-sm text-muted-foreground">
              TEEPEE is an invite-only trip planner for a small group of
              Travellers, not a public product. This page describes, plainly
              and specifically, what it collects about you and why — not a
              legal document, just an accurate account of what the system
              actually does. The Admin (TEEPEE&apos;s operator) has read it and is
              the person to ask if anything here is unclear.
            </p>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              What TEEPEE collects
            </h2>
            <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  Your Google profile and sign-in tokens.
                </span>{" "}
                Signing in is Google sign-in only, so TEEPEE receives your
                name, email address and avatar image from Google, and stores
                the OAuth tokens Google issues for your session (the access
                and refresh tokens, the granted scope, and a session token
                identifying your browser).
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Everything you put in a Trip.
                </span>{" "}
                Stops, Transport, Accommodation, Items, Costs, Notes, Journal
                entries, Checklists, Globe Markers — the trip content you and
                the other Travellers on a Trip enter.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  A record of changes to a Trip.
                </span>{" "}
                Creating, changing or deleting a Stop, Item, Transport,
                Accommodation, Chapter or Cost — or leaving a Note — is
                logged as an Activity: who did it, when, and for a change,
                which fields moved from what to what. This is the Trip&apos;s
                shared history, visible to the Travellers on that Trip.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Files you upload.
                </span>{" "}
                Attachments such as tickets, confirmations and screenshots.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Push subscriptions.
                </span>{" "}
                If you turn on the Digest on a Device, TEEPEE stores what
                that Device&apos;s browser gives it to deliver a push
                notification, plus a coarse device type (&quot;iPhone&quot;,
                &quot;Mac&quot;, and similar — derived once from the
                browser&apos;s user agent, never anything more specific), the
                timezone that Device last reported, and when it was last
                seen.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Error reports.
                </span>{" "}
                When something in TEEPEE breaks — including a failure caught
                in your browser — it records the error message, a stack
                trace, the route it happened on, and your account id if you
                were signed in at the time. It is also written to Vercel&apos;s
                own runtime logs, and for a server-side failure, the raw
                error message is pushed straight to every Admin&apos;s Device —
                that push is skipped for a browser-reported failure, but the
                row and the runtime log are not.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Access requests — including from people who never get an
                  account.
                </span>{" "}
                TEEPEE is invite-only: if you sign in with Google and your
                address is not on the invite list, sign-in is refused, and
                that refusal itself is recorded — your name, email, avatar,
                and how many times you&apos;ve tried, exactly as Google&apos;s
                sign-in flow supplies them — so the Admin can see who has
                asked and decide whether to invite them. This is the most
                surprising thing on this page, so we are saying it plainly:
                TEEPEE can hold a record about you even if you are never
                granted an account. The Admin can approve a request (granting
                access) or dismiss it; a dismissed request is closed for
                good — it does not return to the Admin&apos;s queue, even if
                you sign in again.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Feedback notes.
                </span>{" "}
                A remark you write to the Admin about TEEPEE itself (a
                defect, an annoyance, a suggestion) carries the note text
                plus the circumstances it was written in — the route, a page
                label, the Trip you were viewing (if any), your browser&apos;s
                viewport size and user agent, and your name. You see only
                your own notes in the app; only the Admin sees every author&apos;s
                notes.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Who it is shared with
            </h2>
            <p className="text-sm text-muted-foreground">
              TEEPEE is one small app, not an ad-funded product — nothing
              here is sold, and nothing is shared for marketing. The
              following named services are the ones TEEPEE&apos;s code actually
              contacts:
            </p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Google</span> —
                sign-in. Your avatar image is also loaded straight from
                Google by whoever&apos;s browser is viewing it, so Google sees
                that request too, separately from sign-in itself.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Apple Push and FCM (Firebase Cloud Messaging)
                </span>{" "}
                — deliver the Digest and other push notifications to your
                Devices.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  OpenStreetMap (Nominatim) and CARTO
                </span>{" "}
                — turn place names you enter into map coordinates, and draw
                the map tiles you see on the Summary, the Globe and the Day
                map.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Open-Meteo
                </span>{" "}
                — a Stop&apos;s coordinates and a day&apos;s date, sent to fetch a
                weather forecast (or, for a date too far out to forecast, a
                typical reading from the same calendar date last year).
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Frankfurter
                </span>{" "}
                — currency codes (e.g. &quot;AUD&quot; → &quot;EUR&quot;), sent to fetch an
                exchange rate. No Trip content, just the currency pair.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Cloudflare R2
                </span>{" "}
                — stores uploaded Attachments and Trip cover images.
              </li>
              <li>
                <span className="font-medium text-foreground">Vercel</span> —
                hosts the app, runs the database migration at each deploy,
                and runs the Web Analytics described below.
              </li>
              <li>
                <span className="font-medium text-foreground">Neon</span> —
                hosts the database.
              </li>
              <li>
                <span className="font-medium text-foreground">GitHub</span> —
                holds the nightly full database backup described under
                &quot;How long it&apos;s kept&quot; below: for up to 30 days, GitHub
                stores a complete copy of the database — every Trip, Note,
                email address, Access request and Error report in it — as a
                private build artifact, before it is pulled off to the
                Admin&apos;s own storage outside GitHub.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Analytics, advertising and trackers
            </h2>
            <p className="text-sm text-muted-foreground">
              There is no advertising in TEEPEE, and no third-party tracker
              in the ad-tech sense — no cross-site tracking, no ad targeting,
              no data broker, nothing sold. TEEPEE does use{" "}
              <span className="font-medium text-foreground">
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
              throw (see &quot;What TEEPEE collects&quot; above). A Trip&apos;s id in a
              URL like <code>/trips/…</code> is deliberately not redacted
              from analytics, so usage can be broken down per Trip; a Trip id
              is useless to anyone without an account on that Trip. Beyond
              that one page-view counter, there is no other analytics.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              How long it is kept
            </h2>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  Database backups
                </span>{" "}
                run nightly — the rollback path if a bug or a bad migration
                damages data. Each one is held on GitHub for 30 days as a
                private build artifact, then the Admin pulls it to their own
                storage outside GitHub.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Deleted files
                </span>{" "}
                are not destroyed the instant you delete them: they are kept
                at least 35 days (so they still exist in any backup taken
                before the deletion), then removed the next time the Admin
                runs the cleanup — there is no scheduled job that does this
                on its own.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Error reports and Access requests
                </span>{" "}
                are not deleted on a timer. An Admin can clear an error
                report once it is understood, and approve or dismiss an
                Access request — until then, both simply sit in the
                database (and so in the nightly backups above) like
                everything else.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Getting your data
            </h2>
            <p className="text-sm text-muted-foreground">
              There is no self-serve export yet — ask the admin and
              they&apos;ll send you a copy.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
