import { describe, it, expect } from "vitest";
import { buildPeople, type BuildPeopleInput } from "./people";

const d = (s: string) => new Date(s);

function input(over: Partial<BuildPeopleInput> = {}): BuildPeopleInput {
  return { envEmails: [], allowed: [], users: [], acceptedInvites: [], ...over };
}
const user = (email: string, over = {}) => ({
  id: `u-${email}`,
  email,
  name: "Pat",
  createdAt: d("2026-01-01"),
  lastSeenAt: null,
  tripsOwned: 0,
  tripsOn: 0,
  ...over,
});
const row = (email: string, note: string | null = null, id = `r-${email}`) => ({
  id,
  email,
  note,
  createdAt: d("2026-02-01"),
});

describe("buildPeople", () => {
  it("env + row for the same address is one person, revokeId is the row's id, source env", () => {
    const people = buildPeople(input({ envEmails: ["a@x.test"], allowed: [row("a@x.test", null, "row-1")] }));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ source: { kind: "env" }, revokeId: "row-1" });
  });

  it("User email differing by case from a row is one person with status access", () => {
    const people = buildPeople(input({ allowed: [row("a@x.test")], users: [user("A@X.test")] }));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ email: "a@x.test", status: "access", userId: "u-A@X.test" });
  });

  it("row with no User is never-signed-up", () => {
    const [p] = buildPeople(input({ allowed: [row("a@x.test")] }));
    expect(p).toMatchObject({ status: "never-signed-up", userId: null, name: null, joinedAt: d("2026-02-01").toISOString() });
  });

  it("User with no row and not in env is no-access with revokeId null", () => {
    const [p] = buildPeople(input({ users: [user("a@x.test")] }));
    expect(p).toMatchObject({ status: "no-access", revokeId: null });
  });

  it("approved note wins over an accepted Invite", () => {
    const [p] = buildPeople(
      input({
        allowed: [row("a@x.test", "Approved from an Access request")],
        acceptedInvites: [{ email: "a@x.test", acceptedAt: d("2026-03-01"), tripName: "T", ownerName: "O" }],
      }),
    );
    expect(p!.source).toEqual({ kind: "approved" });
  });

  it("'admitted by Trip Invite' row takes source from the earliest accepted Invite", () => {
    const [p] = buildPeople(
      input({
        allowed: [row("a@x.test", "admitted by Trip Invite")],
        acceptedInvites: [
          { email: "a@x.test", acceptedAt: d("2026-04-01"), tripName: "Later", ownerName: "B" },
          { email: "a@x.test", acceptedAt: d("2026-03-01"), tripName: "First", ownerName: "A" },
        ],
      }),
    );
    expect(p!.source).toEqual({ kind: "invited", tripName: "First", ownerName: "A" });
  });

  it("no row note and no Invite is unknown", () => {
    const [p] = buildPeople(input({ allowed: [row("a@x.test", null)] }));
    expect(p!.source).toEqual({ kind: "unknown" });
  });

  it("sorts by status group, then lastSeenAt desc nulls last", () => {
    const people = buildPeople(
      input({
        allowed: [row("never@x.test"), row("old@x.test"), row("new@x.test"), row("none@x.test")],
        users: [
          user("old@x.test", { lastSeenAt: d("2026-05-01") }),
          user("new@x.test", { lastSeenAt: d("2026-06-01") }),
          user("none@x.test"),
          user("revoked@x.test", { lastSeenAt: d("2026-07-01") }),
        ],
      }),
    );
    expect(people.map((p) => p.email)).toEqual([
      "new@x.test",
      "old@x.test",
      "none@x.test",
      "never@x.test",
      "revoked@x.test",
    ]);
  });
});
