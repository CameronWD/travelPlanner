import type { Metadata } from "next";
import { requireAdmin } from "@/lib/guards";
import { listAccessRequests, listAllowedEmails } from "@/server/actions/access-requests";
import { listErrorReports } from "@/server/actions/error-reports";
import { CountBadge } from "@/components/ui/count-badge";
import { AccessRequestsPanel } from "./access-requests";
import { AllowedEmailsPanel } from "./allowed-emails";
import { ErrorReportsPanel } from "./error-reports";

export const metadata: Metadata = { title: "Admin" };

/**
 * Restyle only (ARCH-TEN-3c guard logic unchanged). Operator console: plain, dense, ink —
 * no accent fills except the count badges, so it never reads as a traveller screen.
 * Panel rows: replace `rounded-md border border-border p-3` with
 *   `rounded-md border-2 border-border bg-card p-3.5` and secondary text with `text-muted-foreground font-medium`.
 * Destructive outline buttons: `variant="outline" className="border-destructive text-destructive hover:bg-destructive/10"`.
 */
function Section({ id, title, count, hint, children }: { id: string; title: string; count?: number; hint: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-border pb-2">
        <h3 id={id} className="flex items-center gap-2 text-lg">{title}{count ? <><CountBadge count={count} /><span className="sr-only">, {count}</span></> : null}</h3>
        <p className="text-xs font-semibold text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [accessRequests, allowedEmails, errorReports] = await Promise.all([listAccessRequests(), listAllowedEmails(), listErrorReports()]);
  const now = new Date();
  const viewerEmail = admin.email ? admin.email.trim().toLowerCase() : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-9">
      <div className="flex flex-col gap-1">
        <p className="text-label text-muted-foreground">Operator</p>
        <h2>Admin</h2>
      </div>
      <Section id="adm-req" title="Access requests" count={accessRequests.length} hint="People who tried to sign in">
        <AccessRequestsPanel initial={accessRequests} now={now} />
      </Section>
      <Section id="adm-allow" title="Who can sign in" hint="The allowlist">
        <AllowedEmailsPanel initial={allowedEmails} now={now} viewerEmail={viewerEmail} />
      </Section>
      <Section id="adm-err" title="Errors" count={errorReports.length} hint="Newest first">
        <ErrorReportsPanel initial={errorReports} now={now} />
      </Section>
    </div>
  );
}
