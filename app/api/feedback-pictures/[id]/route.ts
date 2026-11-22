import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { serveAttachment } from "@/lib/attachment-serve";

// GET /api/feedback-pictures/:id — the author's, or an Admin's. Everyone else,
// signed out included, gets the same 404 a missing id gets, so the route
// never confirms that a picture exists (hence `auth()` and not `requireUser`,
// which redirects).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const notFound = () =>
    NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const session = await auth();
  const user = session?.user;
  if (!user?.id) return notFound();

  const picture = await db.feedbackPicture.findUnique({
    where: { id },
    select: { id: true, mime: true, size: true, storageKey: true, note: { select: { authorId: true } } },
  });
  if (!picture) return notFound();
  if (picture.note.authorId !== user.id && !isAdminEmail(user.email)) return notFound();

  return serveAttachment({
    filename: picture.id,
    mime: picture.mime,
    storageKey: picture.storageKey,
    size: picture.size,
  });
}
