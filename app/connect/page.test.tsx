import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { requireUser, getOAuthClientPublic, consent, assign, SECRET } = vi.hoisted(() => ({
  SECRET: "test-secret-test-secret-test-secret-0123",
  requireUser: vi.fn(),
  getOAuthClientPublic: vi.fn(),
  consent: vi.fn(),
  assign: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireUser }));
vi.mock("@/lib/auth", () => ({
  authServer: { api: { getOAuthClientPublic }, $context: Promise.resolve({ secret: SECRET }) },
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { oauth2: { consent } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ cookie: "session=1" })) }));

import ConnectPage, { metadata } from "./page";
import { signOAuthQuery } from "@/test/helpers/signed-oauth-query";

// The query the provider redirects to /connect with: the authorise request,
// `exp`, `ba_iat`, the signed-name list `ba_param`, and `sig` (really signed).
const REQUEST = {
  response_type: "code",
  client_id: "claude-1",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  scope: "openid offline_access",
};
let SIGNED_QUERY = "";
let SIGNED: Record<string, string | string[]> = {};
const asRecord = (query: string) => {
  const rec: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const prev = rec[k];
    rec[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return rec;
};
beforeEach(async () => {
  SIGNED_QUERY = await signOAuthQuery(REQUEST, SECRET);
  SIGNED = asRecord(SIGNED_QUERY);
});

afterEach(() => vi.clearAllMocks());

async function renderPage(searchParams: Record<string, string | string[]>) {
  requireUser.mockResolvedValue({ id: "u1", name: "Ana", email: "ana@example.com", image: null });
  render(await ConnectPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("/connect (Claude's consent screen)", () => {
  it("names the asking client, where it returns to, and the Traveller, in plain words", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    await renderPage(SIGNED);
    expect(screen.getByRole("heading", { level: 1, name: "Claude wants to access your trips as Ana" })).toBeInTheDocument();
    expect(screen.getByText("Returns to claude.ai")).toBeInTheDocument();
    expect(
      screen.getByText("It will see and change exactly what you can. Everything it does shows in Activity, marked via Claude."),
    ).toBeInTheDocument();
    expect(getOAuthClientPublic).toHaveBeenCalledWith({ query: { client_id: "claude-1" }, headers: expect.any(Headers) });
  });

  it("shows another client's own name", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude Code" });
    await renderPage(SIGNED);
    expect(screen.getByRole("heading", { level: 1, name: "Claude Code wants to access your trips as Ana" })).toBeInTheDocument();
  });

  it("falls back to the Traveller's email when they have no name", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    requireUser.mockResolvedValue({ id: "u1", name: null, email: "ana@example.com", image: null });
    render(await ConnectPage({ searchParams: Promise.resolve(SIGNED) }));
    expect(screen.getByRole("heading", { level: 1, name: "Claude wants to access your trips as ana@example.com" })).toBeInTheDocument();
  });

  it("Allow sends consent with the signed query and follows the redirect back to Claude", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    consent.mockResolvedValue({ data: { redirect: true, url: "https://claude.ai/api/mcp/auth_callback?code=c1" }, error: null });
    vi.stubGlobal("location", { ...window.location, assign });
    await renderPage({ ...SIGNED, panel: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(consent).toHaveBeenCalledWith({ accept: true, oauth_query: SIGNED_QUERY });
    expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=c1");
    vi.unstubAllGlobals();
  });

  it("Cancel sends consent with accept: false", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    consent.mockResolvedValue({ data: { redirect: true, url: "https://claude.ai/api/mcp/auth_callback?error=access_denied" }, error: null });
    vi.stubGlobal("location", { ...window.location, assign });
    await renderPage(SIGNED);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(consent).toHaveBeenCalledWith({ accept: false, oauth_query: SIGNED_QUERY });
    expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?error=access_denied");
    vi.unstubAllGlobals();
  });

  it("says so when the answer does not go through, and lets the Traveller try again", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    consent.mockResolvedValue({ data: null, error: { status: 400, message: "invalid_signature" } });
    await renderPage(SIGNED);
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That did not go through. Start again from Claude.");
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
  });

  it("with no client_id, nothing is asking to connect", async () => {
    await renderPage({});
    expect(screen.getByRole("heading", { level: 1, name: "Nothing is asking to connect." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(getOAuthClientPublic).not.toHaveBeenCalled();
  });

  it("an unknown or disabled client is treated as nothing asking", async () => {
    getOAuthClientPublic.mockRejectedValue(new Error("NOT_FOUND"));
    await renderPage(SIGNED);
    expect(screen.getByRole("heading", { level: 1, name: "Nothing is asking to connect." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });

  it("never names an unnamed client: it is an app, shown by where it returns to", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "" });
    await renderPage(SIGNED);
    expect(
      screen.getByRole("heading", { level: 1, name: "An app (returns to claude.ai) wants to access your trips as Ana" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Claude wants/)).not.toBeInTheDocument();
  });

  it("shows the redirect host the signed query names, even for a client calling itself Claude", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    const query = asRecord(await signOAuthQuery({ ...REQUEST, redirect_uri: "http://localhost:53712/callback" }, SECRET));
    await renderPage(query);
    expect(screen.getByText("Returns to localhost:53712")).toBeInTheDocument();
  });

  it.each([
    ["a tampered query", async () => ({ ...SIGNED, client_id: "other-client" })],
    ["an expired query", async () => asRecord(await signOAuthQuery(REQUEST, SECRET, -1))],
    ["a hand-made query", async () => ({ client_id: "claude-1", redirect_uri: "https://claude.ai/cb", sig: "x", ba_param: ["client_id"] })],
    ["a query signed with another secret", async () => asRecord(await signOAuthQuery(REQUEST, "another-secret-another-secret-0123456"))],
  ])("%s asks for nothing", async (_label, query) => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    await renderPage(await query());
    expect(screen.getByRole("heading", { level: 1, name: "Nothing is asking to connect." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(getOAuthClientPublic).not.toHaveBeenCalled();
  });

  it("requires a signed-in Traveller", async () => {
    getOAuthClientPublic.mockResolvedValue({ client_id: "claude-1", client_name: "Claude" });
    await renderPage(SIGNED);
    expect(requireUser).toHaveBeenCalled();
  });

  it("titles the page", () => {
    expect(metadata.title).toBe("Connect Claude");
  });
});
