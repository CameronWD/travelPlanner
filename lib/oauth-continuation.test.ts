import { describe, expect, it } from "vitest";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { signOAuthQuery } from "@/test/helpers/signed-oauth-query";
import { OAUTH_AUTHORIZE_PATH, isOAuthQuery, oauthContinuation, signedOAuthQuery, toSearchParams } from "./oauth-continuation";

const SECRET = "test-secret-test-secret-test-secret-0123";
const REQUEST = {
  response_type: "code",
  client_id: "claude-1",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  state: "s+1/2",
  code_challenge: "abc",
  code_challenge_method: "S256",
  resource: "http://localhost:3000/api/mcp",
};

describe("signOAuthQuery (test helper)", () => {
  it("produces a query the provider itself verifies", async () => {
    expect(await verifyOAuthQueryParams(await signOAuthQuery(REQUEST, SECRET), SECRET)).toBe(true);
  });
});

describe("oauthContinuation", () => {
  it("is null for an ordinary visit", async () => {
    expect(await oauthContinuation(new URLSearchParams("callbackUrl=/trips&panel=sign-in"), SECRET)).toBeNull();
    expect(await oauthContinuation(new URLSearchParams("client_id=x"), SECRET)).toBeNull();
  });

  it("continues into the original authorise request, without the signing parameters", async () => {
    const params = new URLSearchParams(await signOAuthQuery(REQUEST, SECRET));
    params.set("panel", "sign-in"); // the Landing's own parameter rides alongside
    const c = await oauthContinuation(params, SECRET);
    expect(c?.verified).toBe(true);
    const url = new URL(c!.path, "http://x");
    expect(url.pathname).toBe(OAUTH_AUTHORIZE_PATH);
    expect(Object.fromEntries(url.searchParams)).toEqual(REQUEST);
  });

  it("drops prompt=login and max_age, which the sign-in just satisfied, and keeps other prompts", async () => {
    const c = await oauthContinuation(new URLSearchParams(await signOAuthQuery({ ...REQUEST, prompt: "login consent", max_age: "0" }, SECRET)), SECRET);
    const url = new URL(c!.path, "http://x");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.has("max_age")).toBe(false);
    const only = await oauthContinuation(new URLSearchParams(await signOAuthQuery({ ...REQUEST, prompt: "login" }, SECRET)), SECRET);
    expect(new URL(only!.path, "http://x").searchParams.has("prompt")).toBe(false);
  });

  it("reports an expired or tampered query as unverified, still pointing at authorise", async () => {
    const expired = await oauthContinuation(new URLSearchParams(await signOAuthQuery(REQUEST, SECRET, -1)), SECRET);
    expect(expired?.verified).toBe(false);
    expect(expired?.path.startsWith(`${OAUTH_AUTHORIZE_PATH}?`)).toBe(true);
    const tampered = new URLSearchParams(await signOAuthQuery(REQUEST, SECRET));
    tampered.set("redirect_uri", "https://evil.example/cb");
    expect((await oauthContinuation(tampered, SECRET))?.verified).toBe(false);
    expect((await oauthContinuation(new URLSearchParams("client_id=x&sig=junk"), SECRET))?.verified).toBe(false);
  });
});

describe("signedOAuthQuery", () => {
  it("keeps only sig and the parameters ba_param lists, so the signature still verifies", async () => {
    const params = new URLSearchParams(await signOAuthQuery(REQUEST, SECRET));
    params.set("panel", "sign-in");
    const signed = signedOAuthQuery(params)!;
    expect(new URLSearchParams(signed).has("panel")).toBe(false);
    expect(await verifyOAuthQueryParams(signed, SECRET)).toBe(true);
  });
  it("is null without a signature", () => {
    expect(signedOAuthQuery(new URLSearchParams("client_id=x"))).toBeNull();
  });
});

describe("toSearchParams / isOAuthQuery", () => {
  it("keeps repeated parameters", () => {
    expect(toSearchParams({ ba_param: ["a", "b"], x: "1", y: undefined }).toString()).toBe("ba_param=a&ba_param=b&x=1");
  });
  it("needs both client_id and sig", () => {
    expect(isOAuthQuery(new URLSearchParams("client_id=a&sig=b"))).toBe(true);
    expect(isOAuthQuery(new URLSearchParams("client_id=a"))).toBe(false);
  });
});
