import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  generateKey,
  sanitiseFilename,
  validateUpload,
} from "./storage";

// ---------------------------------------------------------------------------
// generateKey
// ---------------------------------------------------------------------------

describe("generateKey", () => {
  it("includes the tripId in the key", () => {
    const key = generateKey({ trip: "trip-abc" }, "id-1", "photo.jpg");
    expect(key).toContain("trip-abc");
  });

  it("starts with trips/<tripId>/", () => {
    const key = generateKey({ trip: "trip-xyz" }, "uid-42", "doc.pdf");
    expect(key).toMatch(/^trips\/trip-xyz\//);
  });

  it("includes the uniqueId in the key", () => {
    const key = generateKey({ trip: "trip-1" }, "unique-99", "file.png");
    expect(key).toContain("unique-99");
  });

  it("sanitises the filename", () => {
    const key = generateKey({ trip: "trip-1" }, "uid", "my file (1).pdf");
    // spaces and parens replaced/collapsed with underscores
    expect(key).not.toMatch(/[\s()]/);
    // the sanitised name ends with .pdf and has no raw spaces or parens
    expect(key).toMatch(/\.pdf$/);
    expect(key).toContain("my");
  });

  it("strips path separators from the filename", () => {
    const key = generateKey({ trip: "trip-1" }, "uid", "../../etc/passwd");
    // path.basename removes the traversal; the remaining part is safe
    expect(key).not.toContain("..");
    expect(key).not.toContain("/etc/");
  });

  it("produces unique keys for different uniqueIds", () => {
    const a = generateKey({ trip: "trip-1" }, "uuid-aaaa", "image.png");
    const b = generateKey({ trip: "trip-1" }, "uuid-bbbb", "image.png");
    expect(a).not.toBe(b);
  });

  it("produces unique keys for different tripIds", () => {
    const a = generateKey({ trip: "trip-1" }, "uid", "image.png");
    const b = generateKey({ trip: "trip-2" }, "uid", "image.png");
    expect(a).not.toBe(b);
  });

  it("starts with globes/<globeId>/ for globe-scoped keys", () => {
    const key = generateKey({ globe: "globe-99" }, "uid-1", "photo.jpg");
    expect(key).toMatch(/^globes\/globe-99\//);
  });

  it("produces unique keys for globe vs trip scope", () => {
    const trip = generateKey({ trip: "id-1" }, "uid", "file.txt");
    const globe = generateKey({ globe: "id-1" }, "uid", "file.txt");
    expect(trip).not.toBe(globe);
  });
});

// ---------------------------------------------------------------------------
// sanitiseFilename
// ---------------------------------------------------------------------------

describe("sanitiseFilename", () => {
  it("strips directory separators", () => {
    expect(sanitiseFilename("a/b/c.txt")).toBe("c.txt");
  });

  it("replaces spaces", () => {
    expect(sanitiseFilename("my file.pdf")).toBe("my_file.pdf");
  });

  it("preserves dots and hyphens", () => {
    expect(sanitiseFilename("my-file.name.jpg")).toBe("my-file.name.jpg");
  });

  it("returns 'file' for an empty result", () => {
    expect(sanitiseFilename("   ")).toBe("file");
  });
});

// ---------------------------------------------------------------------------
// validateUpload
// ---------------------------------------------------------------------------

describe("validateUpload", () => {
  const VALID_PNG = { mime: "image/png", size: 1024 };

  it("accepts image/png under size limit", () => {
    expect(validateUpload(VALID_PNG)).toEqual({ ok: true });
  });

  it("accepts image/jpeg", () => {
    expect(validateUpload({ mime: "image/jpeg", size: 500 })).toEqual({ ok: true });
  });

  it("accepts image/webp", () => {
    expect(validateUpload({ mime: "image/webp", size: 100 })).toEqual({ ok: true });
  });

  it("accepts image/gif", () => {
    expect(validateUpload({ mime: "image/gif", size: 200 })).toEqual({ ok: true });
  });

  it("accepts application/pdf", () => {
    expect(validateUpload({ mime: "application/pdf", size: 1024 * 1024 })).toEqual({ ok: true });
  });

  it("accepts text/plain", () => {
    expect(validateUpload({ mime: "text/plain", size: 512 })).toEqual({ ok: true });
  });

  it("rejects a disallowed MIME type", () => {
    const result = validateUpload({ mime: "application/zip", size: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not allowed/i);
    }
  });

  it("rejects video/mp4", () => {
    const result = validateUpload({ mime: "video/mp4", size: 100 });
    expect(result.ok).toBe(false);
  });

  it("rejects a file exactly at 10 MiB + 1 byte", () => {
    const result = validateUpload({ mime: "image/png", size: 10 * 1024 * 1024 + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/too large/i);
    }
  });

  it("accepts a file exactly at 10 MiB", () => {
    expect(validateUpload({ mime: "image/png", size: 10 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it("rejects size 0 with disallowed type regardless", () => {
    const result = validateUpload({ mime: "application/octet-stream", size: 0 });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Local-disk storage round-trip
// ---------------------------------------------------------------------------

describe("localDiskStorage (round-trip)", async () => {
  // We use a dedicated temp dir so tests don't contaminate .uploads/
  const tmpDir = path.join(os.tmpdir(), `storage-test-${process.pid}`);

  // Temporarily override process.cwd to point at our temp dir.
  // localDiskStorage.uploadsRoot() calls process.cwd(), so we patch it.
  let originalCwd: () => string;

  afterEach(async () => {
    if (originalCwd) {
      process.cwd = originalCwd;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function withStorage() {
    await fs.mkdir(tmpDir, { recursive: true });
    originalCwd = process.cwd;
    process.cwd = () => tmpDir;
    // Re-import localDiskStorage through the module so it uses patched cwd
    const { getStorage } = await import("./storage");
    const old = process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_DRIVER;
    const storage = getStorage();
    if (old !== undefined) process.env.STORAGE_DRIVER = old;
    return storage;
  }

  it("saves, reads, and deletes a buffer round-trip", async () => {
    const storage = await withStorage();
    const key = "trips/trip-1/test-id-file.txt";
    const data = Buffer.from("hello world");

    await storage.save(key, data, "text/plain");
    const read = await storage.read(key);
    expect(read).not.toBeNull();
    expect(read?.toString()).toBe("hello world");

    await storage.delete(key);
    const afterDelete = await storage.read(key);
    expect(afterDelete).toBeNull();
  });

  it("returns null for a missing key", async () => {
    const storage = await withStorage();
    const result = await storage.read("trips/trip-x/nonexistent.txt");
    expect(result).toBeNull();
  });

  it("delete is a no-op for a missing key", async () => {
    const storage = await withStorage();
    await expect(storage.delete("trips/trip-x/ghost.txt")).resolves.not.toThrow();
  });

  it("creates intermediate directories automatically", async () => {
    const storage = await withStorage();
    const key = "trips/deep/nested/dir/file.pdf";
    await storage.save(key, Buffer.from("pdf bytes"), "application/pdf");
    const result = await storage.read(key);
    expect(result?.toString()).toBe("pdf bytes");
  });

  it("refuses keys that escape the uploads root (path traversal)", async () => {
    const storage = await withStorage();
    await expect(
      storage.save("../escape.txt", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow(/escapes/i);
    await expect(storage.read("../../etc/passwd")).rejects.toThrow(/escapes/i);
    await expect(storage.delete("../../oops")).rejects.toThrow(/escapes/i);
  });
});

// ---------------------------------------------------------------------------
// S3-compatible storage (R2) — SDK mocked, no network
// ---------------------------------------------------------------------------

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

describe("S3-compatible storage (R2 driver)", () => {
  const R2_ENV: Record<string, string> = {
    STORAGE_DRIVER: "r2",
    CLOUDFLARE_ACCOUNT_ID: "acct123",
    R2_BUCKET_NAME: "trip-files",
    R2_ACCESS_KEY_ID: "ak",
    R2_SECRET_ACCESS_KEY: "sk",
  };
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    sendMock.mockReset();
    saved = {};
    for (const [k, v] of Object.entries(R2_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(R2_ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("save() sends a PutObjectCommand with bucket, key, body, content-type", async () => {
    sendMock.mockResolvedValueOnce({});
    const { getStorage } = await import("./storage");
    await getStorage().save("trips/t1/uid-a.png", Buffer.from("img"), "image/png");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({
      Bucket: "trip-files",
      Key: "trips/t1/uid-a.png",
      ContentType: "image/png",
    });
    expect((cmd.input.Body as Buffer).toString()).toBe("img");
  });

  it("read() returns a Buffer of the object bytes", async () => {
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([104, 105]) },
    });
    const { getStorage } = await import("./storage");
    const buf = await getStorage().read("trips/t1/uid-a.png");
    expect(buf?.toString()).toBe("hi");
  });

  it("read() returns null when the object is missing (NoSuchKey)", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );
    const { getStorage } = await import("./storage");
    expect(await getStorage().read("trips/t1/missing.png")).toBeNull();
  });

  it("read() rethrows non-not-found errors", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { name: "AccessDenied" }),
    );
    const { getStorage } = await import("./storage");
    await expect(getStorage().read("trips/t1/x.png")).rejects.toThrow(/boom/);
  });

  it("delete() sends a DeleteObjectCommand", async () => {
    sendMock.mockResolvedValueOnce({});
    const { getStorage } = await import("./storage");
    await getStorage().delete("trips/t1/uid-a.png");
    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({ Bucket: "trip-files", Key: "trips/t1/uid-a.png" });
  });

  it("throws a clear error when a required env var is missing", async () => {
    delete process.env.R2_BUCKET_NAME;
    const { getStorage } = await import("./storage");
    expect(() => getStorage()).toThrow(/R2_BUCKET_NAME is required/);
  });
});

// ---------------------------------------------------------------------------
// S3-compatible storage (S3 driver) — SDK mocked, no network
// ---------------------------------------------------------------------------

describe("S3-compatible storage (S3 driver)", () => {
  const S3_ENV: Record<string, string> = {
    STORAGE_DRIVER: "s3",
    AWS_REGION: "us-east-1",
    S3_BUCKET_NAME: "trip-files-s3",
    AWS_ACCESS_KEY_ID: "ak",
    AWS_SECRET_ACCESS_KEY: "sk",
  };
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    sendMock.mockReset();
    saved = {};
    for (const [k, v] of Object.entries(S3_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(S3_ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("save() sends a PutObjectCommand with the S3 bucket and key", async () => {
    sendMock.mockResolvedValueOnce({});
    const { getStorage } = await import("./storage");
    await getStorage().save("trips/t1/x.png", Buffer.from("img"), "image/png");
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "trip-files-s3",
      Key: "trips/t1/x.png",
    });
  });
});
