import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Root 404. Next.js renders this (wrapped by the root layout — same
 * globals.css, fonts, ThemeProvider as every other page) for any URL that
 * doesn't match a route at all — e.g. a stray extra segment like
 * /trips/<id>/nope — since an unmatched request never reaches a nested
 * segment's own not-found.tsx. Same non-disclosure copy as
 * app/(app)/not-found.tsx: never hint that a trip exists.
 */
export default function RootNotFound() {
  return (
    <ErrorPanel
      kind="not-found"
      title="Nothing here"
      description="This page doesn’t exist, or you don’t have access to it."
      actions={
        <Button asChild>
          <Link href="/trips">Back to trips</Link>
        </Button>
      }
    />
  );
}
