import { afterEach, describe, expect, it, vi } from "vitest";

const { headersGet, redirectMock } = vi.hoisted(() => ({
  headersGet: vi.fn<(name: string) => string | null>(() => null),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT ${href}`);
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { signInRedirect } from "./sign-in-redirect";

afterEach(() => vi.clearAllMocks());

describe("signInRedirect", () => {
  it("redirects to the Landing with the proxy's request path as callbackUrl", async () => {
    headersGet.mockReturnValueOnce("/trips/kyoto/plan?day=3");
    await expect(signInRedirect()).rejects.toThrow("NEXT_REDIRECT /?callbackUrl=%2Ftrips%2Fkyoto%2Fplan%3Fday%3D3");
    expect(headersGet).toHaveBeenCalledWith("x-request-path");
  });
  it("redirects to plain / when the header is absent", async () => {
    await expect(signInRedirect()).rejects.toThrow("NEXT_REDIRECT /");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
