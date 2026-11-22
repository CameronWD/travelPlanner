import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "@/lib/storage";
import { pictureFileName, type FeedbackNoteRow } from "@/lib/feedback/inbox";

const KEPT_STATUSES = new Set(["OPEN", "NEEDS_REVIEW"]);

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
}

/**
 * Mirror the pictures of open and needs-review notes into `dir/<note id>/`,
 * and drop the folders of every other note. Screenshots are git-ignored (ADR
 * 0040), so this folder is a cache of the database, never a record.
 */
export async function pullPictures(opts: {
  notes: FeedbackNoteRow[];
  storage: Pick<Storage, "read">;
  dir: string;
}): Promise<{ written: number; removed: number }> {
  const { notes, storage, dir } = opts;
  const kept = notes.filter((n) => KEPT_STATUSES.has(n.status));
  const keptIds = new Set(kept.map((n) => n.id));

  let removed = 0;
  let existing: string[] = [];
  try {
    existing = await readdir(dir);
  } catch {
    // First pull: nothing to prune yet.
  }
  for (const name of existing) {
    if (keptIds.has(name)) continue;
    await rm(path.join(dir, name), { recursive: true, force: true });
    removed += 1;
  }

  let written = 0;
  for (const note of kept) {
    for (const picture of note.pictures) {
      const file = path.join(dir, note.id, pictureFileName(picture));
      const data = await storage.read(picture.storageKey);
      if (!data) continue;
      if ((await sizeOf(file)) === data.length) continue;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
      written += 1;
    }
  }

  return { written, removed };
}
