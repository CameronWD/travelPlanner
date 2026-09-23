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
 * Every claim below is checked against the code, not assumed:
 *   - lib/error-sink.ts + app/api/client-error/route.ts (error reports)
 *   - lib/access-requests.ts + server/actions/access-requests.ts (access requests)
 *   - lib/push.ts, lib/geocode.ts, lib/map-tiles.ts, lib/storage.ts (third parties)
 *   - components/analytics.tsx + app/layout.tsx (Vercel Web Analytics — see below)
 *   - .github/workflows/db-backup.yml, lib/blob-retention.ts (retention)
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
                  Your Google profile.
                </span>{" "}
                Signing in is Google sign-in only, so TEEPEE receives your
                name, email address and avatar image from Google.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Everything you put in a Trip.
                </span>{" "}
                Stops, Transport, Accommodation, Items, Costs, Notes, Journal
                entries, Checklists, Globe Markers — the trip content you and
                the other Traveller on a Trip enter.
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
                If you turn on the Digest on a Device, TEEPEE stores what that
                Device&apos;s browser gives it to deliver a push notification —
                nothing that identifies the Device beyond that.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Error reports.
                </span>{" "}
                When something in TEEPEE breaks — including a failure caught
                in your browser — it records the error message, a stack
                trace, the route it happened on, and your account id if you
                were signed in at the time. This exists so a bug can be
                found and fixed; nothing about how you use TEEPEE is
                recorded unless it broke.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Access requests — including from people who never get an
                  account.
                </span>{" "}
                TEEPEE is invite-only: if you sign in with Google and your
                address is not on the invite list, sign-in is refused, and
                that refusal itself is recorded — your name, email and
                avatar, exactly as Google&apos;s sign-in flow supplies them — so
                the Admin can see who has asked and decide whether to invite
                them. This is the most surprising thing on this page, so we
                are saying it plainly: TEEPEE can hold a record about you
                even if you are never granted an account. The Admin can
                approve a request (granting access) or dismiss it, at which
                point it is marked dismissed rather than deleted; asking
                again (signing in again) puts it back in front of the Admin.
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
              following named services each do one job, and only see what
              that job needs:
            </p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Google</span> —
                sign-in.
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
                  Cloudflare R2
                </span>{" "}
                — stores uploaded Attachments and Trip cover images.
              </li>
              <li>
                <span className="font-medium text-foreground">Vercel</span> —
                hosts the app.
              </li>
              <li>
                <span className="font-medium text-foreground">Neon</span> —
                hosts the database.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Analytics, advertising and trackers
            </h2>
            <p className="text-sm text-muted-foreground">
              There is no advertising in TEEPEE, and nothing here is a
              third-party tracker in the ad-tech sense — no cross-site
              tracking, no ad targeting, no data broker. To be fully
              accurate: TEEPEE does use{" "}
              <span className="font-medium text-foreground">
                Vercel Web Analytics
              </span>{" "}
              to see coarse, aggregate numbers — which pages get opened, on
              what kind of device — so the app can be improved. It does not
              use cookies and does not build a profile of you; the one thing
              that needed special handling is the read-only Share link URL,
              whose token TEEPEE strips before anything is sent, so a shared
              link&apos;s secret token is never recorded anywhere outside TEEPEE
              itself. Beyond that one page-view counter, there is no other
              analytics, and no third-party tracker of any kind.
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
                run nightly and are kept 30 days — the rollback path if a
                bug or a bad migration damages data.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Deleted files
                </span>{" "}
                are not destroyed the instant you delete them: they are
                retained 35 days (so they still exist in any backup taken
                before the deletion) and removed after.
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
              Getting your data, or having it removed
            </h2>
            <p className="text-sm text-muted-foreground">
              There is no self-serve export or deletion button yet — ask the
              admin and they&apos;ll send you a copy, or delete what is yours.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
