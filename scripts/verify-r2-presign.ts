/**
 * scripts/verify-r2-presign.ts — prove presigned GETs work against REAL R2.
 *
 * R2's S3 compatibility is good but not total, so the presigned-redirect
 * serve path (app/api/attachments/[id], app/api/trips/[tripId]/cover) should
 * be verified against a real bucket once, not just against the SDK. This
 * sandbox has no R2 credentials, so this script packages the check:
 *
 *   CLOUDFLARE_ACCOUNT_ID=… R2_BUCKET_NAME=… R2_ACCESS_KEY_ID=… \
 *   R2_SECRET_ACCESS_KEY=… npx tsx scripts/verify-r2-presign.ts
 *
 * What it does (self-cleaning, one tiny object):
 *   1. save() a 64-byte object under verify-presign/<timestamp>
 *   2. presignDownload() it with the same options the serve routes use
 *   3. fetch the URL with plain HTTPS (no SDK, no credentials — exactly what
 *      a browser does after the 302)
 *   4. assert bytes match and the signed response-header overrides
 *      (content-type / content-disposition / cache-control) came back
 *   5. delete the object
 *
 * Exits 0 on success, 1 with a clear message on any mismatch.
 */

import { getStorage } from "../lib/storage";

async function main(): Promise<void> {
  process.env.STORAGE_DRIVER = "r2";

  const missing = [
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const storage = getStorage();
  const key = `verify-presign/${Date.now()}.bin`;
  const body = Buffer.from(`presign-verify ${new Date().toISOString()}`.padEnd(64, "."));

  console.log(`1/5 putting ${key} (${body.length} bytes)…`);
  await storage.save(key, body, "application/octet-stream");

  try {
    console.log("2/5 presigning (same options as the serve routes)…");
    const url = await storage.presignDownload(key, {
      expiresIn: 300,
      contentType: "application/octet-stream",
      contentDisposition: 'inline; filename="verify.bin"',
      cacheControl: "private, max-age=3600",
    });
    if (!url) throw new Error("presignDownload returned null for the r2 driver");

    console.log("3/5 fetching presigned URL with plain HTTPS (no credentials)…");
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error(`Expected 200 from R2, got ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    console.log("4/5 checking bytes and signed response-header overrides…");
    const got = Buffer.from(await res.arrayBuffer());
    if (!got.equals(body)) throw new Error("Downloaded bytes differ from uploaded bytes");
    const expectHeader = (name: string, want: string) => {
      const gotVal = res.headers.get(name);
      if (gotVal !== want) throw new Error(`Header ${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(gotVal)}`);
    };
    expectHeader("content-type", "application/octet-stream");
    expectHeader("content-disposition", 'inline; filename="verify.bin"');
    expectHeader("cache-control", "private, max-age=3600");

    console.log("5/5 OK — R2 accepts our presigned GETs and honours the header overrides.");
  } finally {
    await storage.delete(key).catch((err) => {
      console.warn(`cleanup: failed to delete ${key}:`, err);
    });
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
