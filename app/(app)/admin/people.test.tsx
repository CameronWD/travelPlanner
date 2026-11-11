import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const revokeAllowedEmail = vi.fn();
vi.mock("@/server/actions/access-requests", () => ({
  get revokeAllowedEmail() {
    return revokeAllowedEmail;
  },
}));

import { PeoplePanel } from "./people";
import type { PersonView } from "@/lib/people";

const NOW = new Date("2026-09-22T12:00:00.000Z");

const base: PersonView = {
  email: "x@example.com",
  name: null,
  userId: null,
  status: "access",
  source: { kind: "approved" },
  joinedAt: "2026-09-01T00:00:00.000Z",
  lastSeenAt: null,
  tripsOwned: 0,
  tripsOn: 0,
  revokeId: null,
};

const people: PersonView[] = [
  { ...base, email: "friend@example.com", name: "Fran Friend", userId: "u1", revokeId: "ae1", tripsOwned: 2, tripsOn: 1, lastSeenAt: "2026-09-22T10:00:00.000Z" },
  { ...base, email: "ops@example.com", name: "Ops", userId: "u2", revokeId: "ae2" },
  { ...base, email: "waiting@example.com", status: "never-signed-up", revokeId: "ae3", source: { kind: "invited", tripName: "Japan", ownerName: "Fran" } },
  { ...base, email: "gone@example.com", name: "Gone", userId: "u3", status: "no-access", source: { kind: "unknown" } },
  { ...base, email: "boot@example.com", name: "Boot", userId: "u4", revokeId: "env:boot@example.com", source: { kind: "env" } },
];

describe("PeoplePanel", () => {
  beforeEach(() => {
    revokeAllowedEmail.mockReset().mockResolvedValue({ success: true });
  });

  it("renders a status badge and source line for each person", () => {
    render(<PeoplePanel initial={people} now={NOW} viewerEmail={null} />);
    expect(screen.getAllByText("Has access")).toHaveLength(3);
    expect(screen.getByText("Admitted, never signed up")).toBeInTheDocument();
    expect(screen.getByText("No access (account remains)")).toBeInTheDocument();
    expect(screen.getByText("Invited to Japan by Fran")).toBeInTheDocument();
    expect(screen.getByText("Set in ALLOWED_EMAILS")).toBeInTheDocument();
    expect(screen.getByText(/Owns 2 · On 1/)).toBeInTheDocument();
    expect(screen.getByText(/Last seen 2h ago/)).toBeInTheDocument();
  });

  it("offers no Revoke for a no-access person, an env entry, or the viewer", () => {
    render(<PeoplePanel initial={people} now={NOW} viewerEmail="ops@example.com" />);
    expect(screen.queryByRole("button", { name: "Revoke gone@example.com" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke boot@example.com" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke ops@example.com" })).not.toBeInTheDocument();
    expect(screen.getByText("Not revocable here")).toBeInTheDocument();
    expect(screen.getByText(/that.?s you/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke friend@example.com" })).toBeInTheDocument();
  });

  it("revoking a person with an account flips them to no access", async () => {
    render(<PeoplePanel initial={people} now={NOW} viewerEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke friend@example.com" }));
    expect(revokeAllowedEmail).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revokeAllowedEmail).toHaveBeenCalledWith("ae1");
    await waitFor(() => expect(screen.getAllByText("No access (account remains)")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Revoke friend@example.com" })).not.toBeInTheDocument();
  });

  it("revoking someone who never signed up removes them", async () => {
    render(<PeoplePanel initial={people} now={NOW} viewerEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke waiting@example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("waiting@example.com")).not.toBeInTheDocument());
  });

  it("keeps the row and shows the error when revoke fails", async () => {
    revokeAllowedEmail.mockResolvedValue({ success: false, errors: { _: ["Nope."] } });
    render(<PeoplePanel initial={people} now={NOW} viewerEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke friend@example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(screen.getAllByText("Has access")).toHaveLength(3);
  });
});
