import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackNoteRow } from "@/lib/feedback/inbox";
import { picturesOnDisk, pullPictures } from "@/lib/feedback/pull-pictures";

function row(
  id: string,
  status: string,
  pictures: FeedbackNoteRow["pictures"],
): FeedbackNoteRow {
  return {
    id,
    body: "b",
    route: "/",
    pageLabel: "Page",
    tripName: null,
    viewport: null,
    userAgent: null,
    status,
    authoredAt: new Date(),
    createdAt: new Date(),
    resolvedAt: null,
    resolution: null,
    authorName: null,
    site: null,
    pictures,
  };
}

const pic = (id: string, position: number, mime = "image/jpeg", size = 3) => ({
  id,
  storageKey: `feedback/${id}`,
  mime,
  size,
  position,
});

describe("pullPictures", () => {
  let dir: string;
  const blobs = new Map<string, Buffer>();
  const storage = { read: vi.fn(async (key: string) => blobs.get(key) ?? null) };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "pull-pictures-"));
    blobs.clear();
    storage.read.mockClear();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("writes each picture of an open or needs-review note to its path", async () => {
    blobs.set("feedback/a", Buffer.from("aaa"));
    blobs.set("feedback/b", Buffer.from("bb"));
    const result = await pullPictures({
      notes: [
        row("n1", "OPEN", [pic("a", 0)]),
        row("n2", "NEEDS_REVIEW", [pic("b", 0, "image/png", 2)]),
      ],
      storage,
      dir,
    });
    expect(result).toEqual({ written: 2, removed: 0, missing: 0 });
    expect(await readFile(path.join(dir, "n1", "1.jpg"), "utf8")).toBe("aaa");
    expect(await readFile(path.join(dir, "n2", "1.png"), "utf8")).toBe("bb");
  });

  it("skips a file that already has the stored size, without reading storage", async () => {
    blobs.set("feedback/a", Buffer.from("aaa"));
    await mkdir(path.join(dir, "n1"));
    await writeFile(path.join(dir, "n1", "1.jpg"), "xyz");
    const result = await pullPictures({
      notes: [row("n1", "OPEN", [pic("a", 0)])],
      storage,
      dir,
    });
    expect(result).toEqual({ written: 0, removed: 0, missing: 0 });
    expect(storage.read).not.toHaveBeenCalled();
    expect(await readFile(path.join(dir, "n1", "1.jpg"), "utf8")).toBe("xyz");
  });

  it("rewrites a file whose size differs", async () => {
    blobs.set("feedback/a", Buffer.from("aaa"));
    await mkdir(path.join(dir, "n1"));
    await writeFile(path.join(dir, "n1", "1.jpg"), "x");
    const result = await pullPictures({
      notes: [row("n1", "OPEN", [pic("a", 0)])],
      storage,
      dir,
    });
    expect(result.written).toBe(1);
    expect(await readFile(path.join(dir, "n1", "1.jpg"), "utf8")).toBe("aaa");
  });

  it("removes the folder of a note no longer open or needs review, and of unknown ids", async () => {
    blobs.set("feedback/a", Buffer.from("aaa"));
    await mkdir(path.join(dir, "done"));
    await writeFile(path.join(dir, "done", "1.jpg"), "x");
    await mkdir(path.join(dir, "gone"));
    await writeFile(path.join(dir, "gone", "1.jpg"), "x");
    const result = await pullPictures({
      notes: [row("done", "DONE", [pic("a", 0)]), row("n1", "OPEN", [pic("a", 0)])],
      storage,
      dir,
    });
    expect(result).toEqual({ written: 1, removed: 2, missing: 0 });
    expect((await readdir(dir)).sort()).toEqual(["n1"]);
  });

  it("counts a picture whose blob could not be read as missing, and writes nothing for it", async () => {
    const result = await pullPictures({
      notes: [row("n1", "OPEN", [pic("missing", 0)])],
      storage,
      dir,
    });
    expect(result).toEqual({ written: 0, removed: 0, missing: 1 });
    await expect(stat(path.join(dir, "n1", "1.jpg"))).rejects.toThrow();
  });

  it("works when the directory does not exist yet", async () => {
    blobs.set("feedback/a", Buffer.from("aaa"));
    const fresh = path.join(dir, "nested", "pictures");
    const result = await pullPictures({
      notes: [row("n1", "OPEN", [pic("a", 0)])],
      storage,
      dir: fresh,
    });
    expect(result.written).toBe(1);
  });
});

describe("picturesOnDisk", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "pictures-on-disk-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("returns the repo-relative path of each open or needs-review picture that exists", async () => {
    await mkdir(path.join(dir, "n1"));
    await writeFile(path.join(dir, "n1", "1.jpg"), "aaa");
    const present = await picturesOnDisk({
      notes: [row("n1", "OPEN", [pic("a", 0), pic("b", 1)]), row("n2", "NEEDS_REVIEW", [pic("c", 0)])],
      dir,
    });
    expect([...present]).toEqual(["docs/feedback/pictures/n1/1.jpg"]);
  });
});
