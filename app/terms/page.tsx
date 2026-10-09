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
      intro="What Teepee is, and the terms for using it."
      other={{ href: "/privacy", label: "Privacy" }}
    >
      <LegalSection title="What this is">
        <p>
          I built Teepee and run it myself, as a personal project, for a
          small invite-only group of friends and family. There&apos;s no
          company or support team behind it, and it isn&apos;t sold as a
          service.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          Teepee is provided as-is, without warranty of any kind. I build
          it carefully and it is backed up nightly, but nothing about it is
          guaranteed. That includes uptime, features continuing to work the
          way they do today, and your data never being lost. Don&apos;t rely on it as
          the only copy of anything that matters to you.
        </p>
      </LegalSection>

      <LegalSection title="Access can be revoked">
        <p>
          Being invited to Teepee doesn&apos;t entitle you to keep using
          it. I can revoke access at any time, for any reason or no reason,
          without notice.
        </p>
      </LegalSection>

      <LegalSection title="What you upload">
        <p>
          Don&apos;t upload anything you don&apos;t have the right to, whether
          files, images or anything else. You are responsible for what you
          put into your trips.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          The <Link href="/privacy" className="tap-target">Privacy</Link> page
          covers what Teepee collects and keeps. For anything else, ask me.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
