// @vitest-environment jsdom
// dom-accessibility-api computes an extra space before the sr-only count's
// comma under happy-dom ("review , 2" vs jsdom's "review, 2") when it skips
// the adjacent aria-hidden CountBadge — a library/environment quirk in
// accessible-name whitespace joining, not something this test's regex
// should be loosened to tolerate.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * app/(app)/admin/page.tsx is an async server component. It calls
 * requireAdmin() itself (not just relying on the panels below it, and not
 * just on the nav hiding the link) and fans out to listAccessRequests /
 * listAllowedEmails (server/actions/access-requests) and listErrorReports
 * (server/actions/error-reports) — all three of which ALSO call
 * requireAdmin(). Mocking @/lib/guards and @/lib/db (rather than the action
 * modules themselves) lets the real actions run, so "a non-admin gets
 * notFound()" is a genuine assertion about the page's dependency chain.
 *
 * All three panel components are marker-mocked: their own behaviour is
 * covered by access-requests.test.tsx / allowed-emails.test.tsx /
 * error-reports.test.tsx, and they read client-only state that has no place
 * in a server-component test.
 */

const requireAdminMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "admin-1", email: "ops@example.com" }),
);
const accessRequestFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const allowedEmailFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const errorReportFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const feedbackNoteFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/guards", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: { findMany: accessRequestFindManyMock, findUnique: vi.fn(), update: vi.fn() },
    allowedEmail: { findMany: allowedEmailFindManyMock, findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    errorReport: { findMany: errorReportFindManyMock, findUnique: vi.fn(), delete: vi.fn() },
    feedbackNote: { findMany: feedbackNoteFindManyMock },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("./access-requests", () => ({
  AccessRequestsPanel: () => <div data-testid="access-requests-panel" />,
}));
vi.mock("./allowed-emails", () => ({
  AllowedEmailsPanel: () => <div data-testid="allowed-emails-panel" />,
}));
vi.mock("./error-reports", () => ({
  ErrorReportsPanel: () => <div data-testid="error-reports-panel" />,
}));
vi.mock("./feedback-review", () => ({
  FeedbackReviewPanel: () => <div data-testid="feedback-review-panel" />,
}));

import AdminPage, { metadata } from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({ id: "admin-1", email: "ops@example.com" });
  accessRequestFindManyMock.mockResolvedValue([]);
  allowedEmailFindManyMock.mockResolvedValue([]);
  errorReportFindManyMock.mockResolvedValue([]);
  feedbackNoteFindManyMock.mockResolvedValue([]);
});

describe("AdminPage", () => {
  it("has an Admin title", () => {
    expect(metadata.title).toBe("Admin");
  });

  // I3 fix: `toHaveBeenCalled()` alone cannot distinguish "the page has its
  // own guard call" from "the page has no guard call of its own and merely
  // relies on listAccessRequests/listAllowedEmails/listErrorReports calling
  // requireAdmin internally" — both shapes leave requireAdminMock called
  // (three times, from the three actions) and both shapes make the
  // "non-admin gets notFound()" test below pass too, since either way the
  // first requireAdmin call to reject aborts everything downstream. The only
  // observable that actually depends on the page having a FOURTH, its-own
  // call is the total count: 1 direct + 1 inside listAccessRequests + 1
  // inside listFeedbackNeedingReview + 1 inside listAllowedEmails + 1 inside
  // listErrorReports = 5. Remove the page's own `await requireAdmin()` and
  // this drops to 4.
  it("calls requireAdmin() itself, not just relying on its data calls", async () => {
    await AdminPage();
    expect(requireAdminMock).toHaveBeenCalledTimes(5);
  });

  it("a non-admin gets notFound() and no data is read", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(accessRequestFindManyMock).not.toHaveBeenCalled();
    expect(allowedEmailFindManyMock).not.toHaveBeenCalled();
    expect(errorReportFindManyMock).not.toHaveBeenCalled();
    expect(feedbackNoteFindManyMock).not.toHaveBeenCalled();
  });

  it("renders all section headings and panels for an admin", async () => {
    const jsx = await AdminPage();
    render(jsx);
    expect(screen.getByText("Access requests")).toBeInTheDocument();
    expect(screen.getByText("Feedback needing review")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-review-panel")).toBeInTheDocument();
    expect(screen.getByText("Who can sign in")).toBeInTheDocument();
    expect(screen.getByText("Errors")).toBeInTheDocument();
    expect(screen.getByTestId("access-requests-panel")).toBeInTheDocument();
    expect(screen.getByTestId("allowed-emails-panel")).toBeInTheDocument();
    expect(screen.getByTestId("error-reports-panel")).toBeInTheDocument();
  });

  // Spec 2026-10-02 §D: second section — a queue of people waiting, like
  // Access requests above it; the allowlist is not — with a count badge.
  it("places Feedback needing review after Access requests and before the allowlist, counting the rows", async () => {
    feedbackNoteFindManyMock.mockResolvedValue([
      { id: "n1", body: "a", pageLabel: "Plan editor", tripName: null, authorName: "X", authoredAt: new Date(), site: "beta" },
      { id: "n2", body: "b", pageLabel: "Files", tripName: null, authorName: null, authoredAt: new Date(), site: null },
    ]);
    render(await AdminPage());
    const review = screen.getByRole("heading", { name: /Feedback needing review,\s*2/ });
    const access = screen.getByText("Access requests");
    const allow = screen.getByText("Who can sign in");
    expect(access.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(review.compareDocumentPosition(allow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Accept or decline from the terminal")).toBeInTheDocument();
  });
});
