import type { Metadata } from "next";
import { requireAdmin } from "@/lib/guards";
import { listAccessRequests, listAllowedEmails } from "@/server/actions/access-requests";
import { listErrorReports } from "@/server/actions/error-reports";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccessRequestsPanel } from "./access-requests";
import { AllowedEmailsPanel } from "./allowed-emails";
import { ErrorReportsPanel } from "./error-reports";

export const metadata: Metadata = { title: "Admin" };

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
    <div className="mx-auto max-w-2xl flex flex-col gap-3.5">
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Admin
      </h2>

      {/* ── Access requests ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">
            Access requests
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <AccessRequestsPanel initial={accessRequests} now={now} />
        </CardContent>
      </Card>

      {/* ── Allowlist ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">
            Who can sign in
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <AllowedEmailsPanel initial={allowedEmails} now={now} viewerEmail={viewerEmail} />
        </CardContent>
      </Card>

      {/* ── Errors (ARCH-OBS-2) ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">
            Errors
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <ErrorReportsPanel initial={errorReports} now={now} />
        </CardContent>
      </Card>
    </div>
  );
}
