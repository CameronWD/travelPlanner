import "server-only";
import { GOOGLE_TIMEOUT_MS, serverKey } from "@/lib/google-fetch";
import { dailyCap } from "@/lib/google-budget";
import { takeGoogleQuota } from "@/lib/google-usage";
import { staticMapUrl, type StaticMapInput } from "./static-map";

export async function fetchStaticMapBytes(input: Omit<StaticMapInput, "key">): Promise<Buffer | null> {
  const key = serverKey();
  if (!key) return null;
  const url = staticMapUrl({ ...input, key });
  if (!url) return null;
  if (!(await takeGoogleQuota("static-maps", dailyCap("static-maps")))) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    if (res.status !== 200) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function fetchStaticMapDataUrl(input: Omit<StaticMapInput, "key">): Promise<string | null> {
  const bytes = await fetchStaticMapBytes(input);
  return bytes ? `data:image/png;base64,${bytes.toString("base64")}` : null;
}
