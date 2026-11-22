import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  current: null as { user: { id: string; email: string; name: string | null; image: string | null } } | null,
}));
vi.mock("@/lib/auth/auth", () => ({ auth: async () => session.current }));

type DbModule = typeof import("@/lib/db");

const AUTHOR = "it-fbpic-author";
const OTHER = "it-fbpic-other";
const ADMIN = "it-fbpic-admin";
const ADMIN_EMAIL = "it-fbpic-admin@example.test";
const KEYS = ["it-fbpic-note-1", "it-fbpic-note-2"];

describe.skipIf(process.env.INTEGRATION !== "1")("Feedback note pictures (real Postgres)", () => {
  let db: DbModule["db"];
  let actions: typeof import("@/server/actions/feedback");
  let GET: typeof import("@/app/api/feedback-pictures/[id]/route").GET;
  let getStorage: typeof import("@/lib/storage").getStorage;
  let MAX_BYTES: number;
  let prevAdmins: string | undefined;

  const signIn = (id: string, email = `${id}@example.test`) => {
    session.current = { user: { id, email, name: null, image: null } };
  };

  const jpeg = (name = "shot.jpg") => new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], name, { type: "image/jpeg" });
  const form = (noteId: string, file: File) => {
    const f = new FormData();
    f.set("noteId", noteId);
    f.set("file", file);
    return f;
  };
  const get = (id: string) => GET(new Request(`http://x/api/feedback-pictures/${id}`) as never, { params: Promise.resolve({ id }) });

  async function makeNote(clientKey: string, authorId = AUTHOR) {
    return db.feedbackNote.create({
      data: { clientKey, body: "b", route: "/", pageLabel: "Home", authorId, authoredAt: new Date() },
    });
  }

  async function clean() {
    const pics = await db.feedbackPicture.findMany({ where: { note: { clientKey: { in: KEYS } } } });
    await Promise.all(pics.map((p) => getStorage().delete(p.storageKey)));
    await db.feedbackNote.deleteMany({ where: { clientKey: { in: KEYS } } });
    await db.user.deleteMany({ where: { id: { in: [AUTHOR, OTHER, ADMIN] } } });
  }

  beforeAll(async () => {
    prevAdmins = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    ({ db } = await import("@/lib/db"));
    actions = await import("@/server/actions/feedback");
    ({ GET } = await import("@/app/api/feedback-pictures/[id]/route"));
    ({ getStorage, MAX_BYTES } = await import("@/lib/storage"));
    await clean();
    await db.user.create({ data: { id: AUTHOR, email: "it-fbpic-author@example.test", name: "Ada" } });
    await db.user.create({ data: { id: OTHER, email: "it-fbpic-other@example.test", name: "Bo" } });
    await db.user.create({ data: { id: ADMIN, email: ADMIN_EMAIL, name: "Cy" } });
  });

  afterAll(async () => {
    await clean();
    if (prevAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = prevAdmins;
  });

  it("stores the author's JPEG at position 0 and serves it from its URL", async () => {
    const note = await makeNote(KEYS[0]);
    signIn(AUTHOR);
    const res = await actions.addFeedbackPicture(form(note.id, jpeg()));
    if (!res.success) throw new Error(JSON.stringify(res));
    const row = await db.feedbackPicture.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.position).toBe(0);
    expect(row.mime).toBe("image/jpeg");
    expect(res.url).toBe(`/api/feedback-pictures/${res.id}`);
    expect(await getStorage().read(row.storageKey)).not.toBeNull();
  });

  it("refuses a fifth picture and writes no blob", async () => {
    const note = await makeNote(KEYS[1]);
    signIn(AUTHOR);
    for (let i = 0; i < 4; i++) {
      const r = await actions.addFeedbackPicture(form(note.id, jpeg()));
      expect(r.success).toBe(true);
    }
    const save = vi.spyOn(getStorage(), "save");
    const fifth = await actions.addFeedbackPicture(form(note.id, jpeg()));
    expect(fifth.success).toBe(false);
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
    expect(await db.feedbackPicture.count({ where: { noteId: note.id } })).toBe(4);
  });

  it("refuses a text file and a file over MAX_BYTES, writing no blob", async () => {
    const note = await db.feedbackNote.findFirstOrThrow({ where: { clientKey: KEYS[0] } });
    signIn(AUTHOR);
    const save = vi.spyOn(getStorage(), "save");
    const text = await actions.addFeedbackPicture(form(note.id, new File(["hi"], "a.txt", { type: "text/plain" })));
    const big = await actions.addFeedbackPicture(
      form(note.id, new File([Buffer.alloc(MAX_BYTES + 1)], "big.jpg", { type: "image/jpeg" })),
    );
    expect(text.success).toBe(false);
    expect(big.success).toBe(false);
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });

  it("refuses anyone but the author, an Admin included", async () => {
    const note = await db.feedbackNote.findFirstOrThrow({ where: { clientKey: KEYS[0] } });
    const before = await db.feedbackPicture.count({ where: { noteId: note.id } });
    signIn(OTHER);
    expect((await actions.addFeedbackPicture(form(note.id, jpeg()))).success).toBe(false);
    signIn(ADMIN, ADMIN_EMAIL);
    expect((await actions.addFeedbackPicture(form(note.id, jpeg()))).success).toBe(false);
    expect(await db.feedbackPicture.count({ where: { noteId: note.id } })).toBe(before);
  });

  it("removes the blob when the row insert fails", async () => {
    const note = await db.feedbackNote.findFirstOrThrow({ where: { clientKey: KEYS[0] } });
    signIn(AUTHOR);
    const save = vi.spyOn(getStorage(), "save");
    const create = vi.spyOn(db.feedbackPicture, "create").mockRejectedValueOnce(new Error("boom"));
    const res = await actions.addFeedbackPicture(form(note.id, jpeg()));
    expect(res.success).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    const key = save.mock.calls[0][0];
    expect(await getStorage().read(key)).toBeNull();
    create.mockRestore();
    save.mockRestore();
  });

  it("lists each note's pictures in position order", async () => {
    signIn(AUTHOR);
    const note = await db.feedbackNote.findFirstOrThrow({ where: { clientKey: KEYS[1] } });
    const rows = await db.feedbackPicture.findMany({ where: { noteId: note.id }, orderBy: { position: "asc" } });
    // Reverse the stored order so position, not insertion, has to decide.
    await db.feedbackPicture.updateMany({ where: { id: rows[0].id }, data: { position: 9 } });
    const res = await actions.listFeedbackNotes();
    if (!res.success) throw new Error("list failed");
    const listed = res.notes.find((n) => n.id === note.id)!;
    expect(listed.pictures.map((p) => p.id)).toEqual([rows[1].id, rows[2].id, rows[3].id, rows[0].id]);
    expect(listed.pictures[0].url).toBe(`/api/feedback-pictures/${rows[1].id}`);
  });

  it("serves the picture to its author and an Admin, and to nobody else", async () => {
    const note = await db.feedbackNote.findFirstOrThrow({ where: { clientKey: KEYS[0] } });
    const pic = await db.feedbackPicture.findFirstOrThrow({ where: { noteId: note.id } });
    signIn(AUTHOR);
    const mine = await get(pic.id);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/jpeg");
    signIn(ADMIN, ADMIN_EMAIL);
    expect((await get(pic.id)).status).toBe(200);
    signIn(OTHER);
    expect((await get(pic.id)).status).toBe(404);
    session.current = null;
    expect((await get(pic.id)).status).toBe(404);
  });

  it("deletes the rows and the blobs with the note", async () => {
    const note = await db.feedbackNote.findFirstOrThrow({ where: { clientKey: KEYS[1] } });
    const pics = await db.feedbackPicture.findMany({ where: { noteId: note.id } });
    expect(pics.length).toBe(4);
    signIn(AUTHOR);
    expect((await actions.deleteFeedbackNote(note.id)).success).toBe(true);
    expect(await db.feedbackPicture.count({ where: { noteId: note.id } })).toBe(0);
    for (const p of pics) expect(await getStorage().read(p.storageKey)).toBeNull();
  });
});
