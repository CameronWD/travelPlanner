import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "What Teepee is, and the terms of using it.",
};

/**
 * Public and unauthenticated, same reasoning as app/privacy/page.tsx — the
 * OAuth consent screen links here, for people who can't yet sign in.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="What Teepee honestly is, in place of a document neither side needs pretending it is something bigger."
      other={{ href: "/privacy", label: "Privacy" }}
    >
      <LegalSection title="What this is">
        <p>
          Teepee is a personal project: a trip planner built and run by
          one operator (the Admin) for a small, invite-only group of
          Travellers. It is not a company, not a commercial service, and
          not something with a support team behind it — it is software
          one person maintains for people they know.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          Teepee is provided as-is, without warranty of any kind. It is
          built carefully and backed up nightly, but nothing about it is
          guaranteed — not uptime, not that a feature keeps working the
          way it does today, not that data is never lost. Do not rely on
          it as the only copy of anything that matters to you.
        </p>
      </LegalSection>

      <LegalSection title="Access can be revoked">
        <p>
          Being invited to Teepee does not entitle you to keep using it.
          The Admin can revoke access at any time, for any reason or no
          reason, without notice.
        </p>
      </LegalSection>

      <LegalSection title="What you upload">
        <p>
          Do not upload anything you do not have the right to — files,
          images, or anything else. You are responsible for what you put
          into your Trips.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          See the <Link href="/privacy">Privacy</Link> page for what Teepee
          collects and keeps. For anything else, ask the Admin.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
