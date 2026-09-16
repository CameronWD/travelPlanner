import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Presigned-URL shape against the R2 endpoint, using the REAL
 * @aws-sdk/s3-request-presigner (signing is pure crypto — no network).
 *
 * lib/storage.test.ts mocks the whole AWS SDK, so this lives in its own file
 * where the real modules load. It pins the properties R2 requires of a
 * presigned GET: SigV4, path-style URL on the account endpoint, and the
 * response-header overrides carried as signed query params. It cannot prove
 * R2 accepts the signature — scripts/verify-r2-presign.ts does that against
 * a real bucket.
 */

const R2_ENV: Record<string, string> = {
  STORAGE_DRIVER: "r2",
  CLOUDFLARE_ACCOUNT_ID: "acct123",
  R2_BUCKET_NAME: "trip-files",
  R2_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKEFAKE",
  R2_SECRET_ACCESS_KEY: "fake-secret-fake-secret-fake-secret",
};
let saved: Record<string, string | undefined>;

beforeEach(() => {
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

describe("presignDownload (R2 driver, real signer)", () => {
  it("produces a SigV4 path-style URL on the R2 endpoint with signed response-header overrides", async () => {
    const { getStorage } = await import("./storage");
    const url = await getStorage().presignDownload("trips/t1/uid-a.png", {
      expiresIn: 300,
      contentType: "image/png",
      contentDisposition: 'inline; filename="a.png"',
      cacheControl: "private, max-age=3600",
    });

    expect(url).not.toBeNull();
    const u = new URL(url!);

    // R2's S3 API lives on the account endpoint; the client is configured
    // path-style, so bucket + key are the path.
    expect(u.host).toBe("acct123.r2.cloudflarestorage.com");
    expect(u.pathname).toBe("/trip-files/trips/t1/uid-a.png");

    // R2 only accepts SigV4 presigned URLs.
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");

    // Response-header overrides ride along as signed query params.
    expect(u.searchParams.get("response-content-type")).toBe("image/png");
    expect(u.searchParams.get("response-content-disposition")).toBe('inline; filename="a.png"');
    expect(u.searchParams.get("response-cache-control")).toBe("private, max-age=3600");
  });
});
