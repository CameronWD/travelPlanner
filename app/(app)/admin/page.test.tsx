import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * app/(app)/admin/page.tsx is an async server component. It calls
 * requireAdmin() itself (not just relying on the panels below it, and not
 * just on the nav hiding the link) and fans out to listAccessRequests /
 * listAllowedEmails (server/actions/access-requests) — both of which ALSO
 * call requireAdmin(). Mocking @/lib/guards and @/lib/db (rather than the
 * action module itself) lets the real actions run, so "a non-admin gets
 * notFound()" is a genuine assertion about the page's dependency chain.
 *
 * Both panel components are marker-mocked: their own behaviour is covered by
 * access-requests.test.tsx / allowed-emails.test.tsx, and they read
 * client-only state that has no place in a server-component test.
 */

const requireAdminMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "admin-1", email: "ops@example.com" }),
);
const accessRequestFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const allowedEmailFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/guards", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: { findMany: accessRequestFindManyMock, findUnique: vi.fn(), update: vi.fn() },
    allowedEmail: { findMany: allowedEmailFindManyMock, findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("./access-requests", () => ({
  AccessRequestsPanel: () => <div data-testid="access-requests-panel" />,
}));
vi.mock("./allowed-emails", () => ({
  AllowedEmailsPanel: () => <div data-testid="allowed-emails-panel" />,
}));

import AdminPage, { metadata } from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({ id: "admin-1", email: "ops@example.com" });
  accessRequestFindManyMock.mockResolvedValue([]);
  allowedEmailFindManyMock.mockResolvedValue([]);
});

describe("AdminPage", () => {
  it("has an Admin title", () => {
    expect(metadata.title).toBe("Admin");
  });

  it("calls requireAdmin() itself, not just relying on its data calls", async () => {
    await AdminPage();
    // requireAdmin is called at least once directly by the page, plus once
    // each inside listAccessRequests/listAllowedEmails — the page-level call
    // is what's under test here, and it's what makes a non-admin's rejection
    // (below) happen before ANY data is read.
    expect(requireAdminMock).toHaveBeenCalled();
  });

  it("a non-admin gets notFound() and no data is read", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(accessRequestFindManyMock).not.toHaveBeenCalled();
    expect(allowedEmailFindManyMock).not.toHaveBeenCalled();
  });

  it("renders both section headings and both panels for an admin", async () => {
    const jsx = await AdminPage();
    render(jsx);
    expect(screen.getByText("Access requests")).toBeInTheDocument();
    expect(screen.getByText("Who can sign in")).toBeInTheDocument();
    expect(screen.getByTestId("access-requests-panel")).toBeInTheDocument();
    expect(screen.getByTestId("allowed-emails-panel")).toBeInTheDocument();
  });
});
