import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/**
 * Server Component. Shared shell for /privacy and /terms (public, unauthenticated — the OAuth
 * consent screen links here). Pages keep their copy; wrap it:
 *   <LegalPage title="Terms" intro="…" other={{ href: "/privacy", label: "Privacy" }}>
 *     <LegalSection title="What this is">…</LegalSection>
 *   </LegalPage>
 * Reading measure 68ch (max-w-reading), body 15px/1.6 at full foreground (not muted — this is
 * the content). On desktop the text runs beside a sticky "On this page" contents column built
 * from the section titles (legalToc) — no client state, just anchors into the page.
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
  const toc = legalToc(children);
  return (
    <div data-legal-page className="min-h-screen bg-background">
      <header className="border-b-2 border-border">
        <div className="mx-auto flex h-16 max-w-page-wide items-center justify-between px-5">
          <Link
            href="/signin"
            aria-label="Teepee sign in"
            className="inline-flex min-h-11 items-center"
          >
            <Logo size={22} />
          </Link>
          {other ? (
            <Link
              href={other.href}
              className="inline-flex min-h-11 items-center text-[13px] font-extrabold"
            >
              {other.label}
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-page-wide px-5 pb-20 pt-10 md:pt-14 lg:grid lg:grid-cols-[minmax(0,68ch)_16rem] lg:justify-center lg:gap-16">
        <div>
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
          <div className="flex max-w-reading flex-col gap-9 border-t-2 border-dashed border-border-soft pt-8">
            {children}
          </div>
        </div>
        {toc.length > 0 ? (
          <nav
            aria-label="On this page"
            className="hidden lg:block lg:sticky lg:top-8 lg:self-start"
          >
            <p className="text-label text-muted-foreground">On this page</p>
            <ul className="mt-3 flex flex-col gap-2">
              {toc.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    className="text-[13px] font-semibold text-muted-foreground underline decoration-transparent underline-offset-2 hover:text-foreground hover:decoration-current"
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section id={slugify(title)} className="flex scroll-mt-8 flex-col gap-2.5">
      <h2 className="text-xl">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] font-medium leading-relaxed text-foreground [&_a]:font-bold [&_a]:underline [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

/** Lowercases a title and replaces runs of non-alphanumerics with a single "-", trimmed. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Pure: collects every `LegalSection` child's `title` into a table of contents, in document
 * order. Recurses through Fragments so `<>…</>` grouping in a page's JSX doesn't hide sections
 * from the contents column. Ignores anything else (conditionals that render null, etc).
 */
export function legalToc(children: ReactNode): { id: string; title: string }[] {
  const toc: { id: string; title: string }[] = [];
  const walk = (node: ReactNode): void => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === LegalSection) {
        // React.isValidElement narrows child.props to `unknown`; the cast is
        // safe here because the `child.type === LegalSection` check above it
        // already confirms the element is a LegalSection, whose only prop
        // shape is { title, children }.
        const { title } = child.props as { title: string };
        toc.push({ id: slugify(title), title });
      } else if (child.type === React.Fragment) {
        walk((child.props as { children?: ReactNode }).children);
      }
    });
  };
  walk(children);
  return toc;
}
