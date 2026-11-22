import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "@/lib/storage";
import { PICTURES_REPO_DIR, pictureFileName, type FeedbackNoteRow } from "@/lib/feedback/inbox";

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
}): Promise<{ written: number; removed: number; missing: number }> {
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
  let missing = 0;
  for (const note of kept) {
    for (const picture of note.pictures) {
      const file = path.join(dir, note.id, pictureFileName(picture));
      if ((await sizeOf(file)) === picture.size) continue;
      const data = await storage.read(picture.storageKey);
      if (!data) {
        missing += 1;
        continue;
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
      written += 1;
    }
  }

  return { written, removed, missing };
}

/** The repo-relative paths, as the inbox lists them, of the open and needs-review pictures that are in `dir`. */
export async function picturesOnDisk(opts: {
  notes: FeedbackNoteRow[];
  dir: string;
}): Promise<Set<string>> {
  const present = new Set<string>();
  for (const note of opts.notes.filter((n) => KEPT_STATUSES.has(n.status))) {
    for (const picture of note.pictures) {
      const name = pictureFileName(picture);
      if ((await sizeOf(path.join(opts.dir, note.id, name))) !== null) {
        present.add(`${PICTURES_REPO_DIR}/${note.id}/${name}`);
      }
    }
  }
  return present;
}
