import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/**
 * Server Component. Shared shell for /privacy and /terms (public, unauthenticated — the OAuth
 * consent screen links here). Pages keep their copy; wrap it:
 *   <LegalPage title="Terms" intro="…" other={{ href: "/privacy", label: "Privacy" }}>
 *     <LegalSection title="What this is">…</LegalSection>
 *   </LegalPage>
 * Reading measure 64ch, body 15px/1.6 at full foreground (not muted — this is the content).
 */
export function LegalPage({
  title,
  intro,
  updated,
  other,
  children,
}: {
  title: string;
  intro?: ReactNode;
  updated?: string;
  other?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div data-legal-page className="min-h-screen bg-background">
      <header className="border-b-2 border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/signin" aria-label="Teepee sign in">
            <Logo size={22} />
          </Link>
          {other ? (
            <Link href={other.href} className="text-[13px] font-extrabold">
              {other.label}
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 md:pt-14">
        <div className="flex flex-col gap-3 pb-8">
          {updated ? (
            <p className="text-label text-muted-foreground">Updated {updated}</p>
          ) : null}
          <h1 className="text-[2.75rem] md:text-[3.5rem]">{title}</h1>
          {intro ? (
            <p className="max-w-[56ch] text-base font-semibold text-muted-foreground text-pretty">
              {intro}
            </p>
          ) : null}
        </div>
        <div className="flex max-w-[64ch] flex-col gap-9 border-t-2 border-dashed border-border-soft pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-xl">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] font-medium leading-relaxed text-foreground [&_a]:font-bold [&_a]:underline [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
