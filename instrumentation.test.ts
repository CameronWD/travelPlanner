import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notFound, redirect } from "next/navigation";
import type { Instrumentation } from "next";

import { onRequestError } from "./instrumentation";

const reportError = vi.fn();
vi.mock("@/lib/error-sink", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const request = { path: "/trips/abc?x=1", method: "GET", headers: {} };
const context: Parameters<Instrumentation.onRequestError>[2] = {
  routerKind: "App Router",
  routePath: "/trips/[tripId]",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
};

function thrownBy(fn: () => never): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("did not throw");
}

describe("onRequestError", () => {
  beforeEach(() => {
    reportError.mockReset();
    reportError.mockResolvedValue(undefined);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records a plain error as a server error on the route", async () => {
    const err = new Error("boom");
    await onRequestError(err, request, context);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(err, {
      source: "server",
      route: "/trips/[tripId]",
      digest: undefined,
    });
  });

  it("passes the digest along when the error has one", async () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    await onRequestError(err, request, context);
    expect(reportError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ digest: "abc123" }),
    );
  });

  it("ignores a redirect", async () => {
    await onRequestError(thrownBy(() => redirect("/")), request, context);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("ignores a not-found", async () => {
    await onRequestError(thrownBy(() => notFound()), request, context);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("does nothing outside the node runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("boom"), request, context);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("resolves even when the sink rejects", async () => {
    reportError.mockRejectedValue(new Error("sink down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      onRequestError(new Error("boom"), request, context),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
