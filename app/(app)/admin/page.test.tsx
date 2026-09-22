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

  // I3 fix: `toHaveBeenCalled()` alone cannot distinguish "the page has its
  // own guard call" from "the page has no guard call of its own and merely
  // relies on listAccessRequests/listAllowedEmails calling requireAdmin
  // internally" — both shapes leave requireAdminMock called (twice, from the
  // two actions) and both shapes make the "non-admin gets notFound()" test
  // below pass too, since either way the first requireAdmin call to reject
  // aborts everything downstream. The only observable that actually depends
  // on the page having a THIRD, its-own call is the total count: 1 direct +
  // 1 inside listAccessRequests + 1 inside listAllowedEmails = 3. Remove the
  // page's own `await requireAdmin()` and this drops to 2.
  it("calls requireAdmin() itself, not just relying on its data calls", async () => {
    await AdminPage();
    expect(requireAdminMock).toHaveBeenCalledTimes(3);
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
