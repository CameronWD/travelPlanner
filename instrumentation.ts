import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  _request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { unstable_rethrow } = await import("next/navigation");
    try {
      unstable_rethrow(err);
    } catch {
      return;
    }
    const { reportError } = await import("@/lib/error-sink");
    const rawDigest =
      typeof err === "object" && err !== null && "digest" in err ? err.digest : undefined;
    const digest = typeof rawDigest === "string" && rawDigest !== "" ? rawDigest : undefined;
    await reportError(err, {
      source: "server",
      route: context.routePath,
      digest,
    });
  } catch (failure) {
    console.error("[instrumentation] could not record a server error:", failure);
  }
};
