import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/guards";
import { listAccessRequests, listAllowedEmails } from "@/server/actions/access-requests";
import { listErrorReports } from "@/server/actions/error-reports";
import { CountBadge } from "@/components/ui/count-badge";
import { AccessRequestsPanel } from "./access-requests";
import { AllowedEmailsPanel } from "./allowed-emails";
import { ErrorReportsPanel } from "./error-reports";

export const metadata: Metadata = { title: "Admin" };

/**
 * One operator-console section: a heading row (kit shape — a bottom rule,
 * an optional count badge, a right-aligned hint) over its panel. Local to
 * this file; it has no reuse outside admin's three sections.
 */
function Section({
  id,
  title,
  count,
  hint,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-border pb-2">
        <h3 id={id} className="flex items-center gap-2 text-lg">
          {title}
          {count ? (
            <>
              <CountBadge count={count} />
              <span className="sr-only">, {count}</span>
            </>
          ) : null}
        </h3>
        <p className="text-xs font-semibold text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The operator's console (ARCH-TEN-3c). `requireAdmin()` is called here AND
 * inside every server action this page's panels call — hiding this route
 * from the nav is not access control, and the page guard alone only stops
 * browsing, not someone who already has an action's id.
 */
export default async function AdminPage() {
  const admin = await requireAdmin();

  const [accessRequests, allowedEmails, errorReports] = await Promise.all([
    listAccessRequests(),
    listAllowedEmails(),
    listErrorReports(),
  ]);

  // One instant for the whole page, computed server-side so the client
  // panels below can't disagree with the server pass (CD-05, same as
  // Account's DevicesPanel).
  const now = new Date();
  const viewerEmail = admin.email ? admin.email.trim().toLowerCase() : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-9">
      <div className="flex flex-col gap-1">
        <p className="text-label text-muted-foreground">Operator</p>
        <h2>Admin</h2>
      </div>

      <Section
        id="adm-req"
        title="Access requests"
        count={accessRequests.length}
        hint="People who tried to sign in"
      >
        <AccessRequestsPanel initial={accessRequests} now={now} />
      </Section>

      <Section id="adm-allow" title="Who can sign in" hint="The allowlist">
        <AllowedEmailsPanel initial={allowedEmails} now={now} viewerEmail={viewerEmail} />
      </Section>

      {/* Errors (ARCH-OBS-2) */}
      <Section id="adm-err" title="Errors" count={errorReports.length} hint="Newest first">
        <ErrorReportsPanel initial={errorReports} now={now} />
      </Section>
    </div>
  );
}
