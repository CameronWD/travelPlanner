export type PersonStatus = "access" | "never-signed-up" | "no-access";
export type PersonSource =
  | { kind: "env" }
  | { kind: "approved" }
  | { kind: "invited"; tripName: string; ownerName: string }
  | { kind: "unknown" };

export interface PersonView {
  email: string;
  name: string | null;
  userId: string | null;
  status: PersonStatus;
  source: PersonSource;
  joinedAt: string | null;
  lastSeenAt: string | null;
  tripsOwned: number;
  tripsOn: number;
  revokeId: string | null;
}

export interface BuildPeopleInput {
  envEmails: string[];
  allowed: { id: string; email: string; note: string | null; createdAt: Date }[];
  users: {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
    lastSeenAt: Date | null;
    tripsOwned: number;
    tripsOn: number;
  }[];
  acceptedInvites: { email: string; acceptedAt: Date; tripName: string; ownerName: string }[];
}

const APPROVED_NOTE = "Approved from an Access request";
const STATUS_ORDER: Record<PersonStatus, number> = { access: 0, "never-signed-up": 1, "no-access": 2 };

export function buildPeople(input: BuildPeopleInput): PersonView[] {
  const env = new Set(input.envEmails.map((e) => e.trim().toLowerCase()));
  const rows = new Map(input.allowed.map((r) => [r.email.trim().toLowerCase(), r]));
  const users = new Map(input.users.map((u) => [u.email.trim().toLowerCase(), u]));

  const earliestInvite = new Map<string, BuildPeopleInput["acceptedInvites"][number]>();
  for (const invite of input.acceptedInvites) {
    const key = invite.email.trim().toLowerCase();
    const current = earliestInvite.get(key);
    if (!current || invite.acceptedAt < current.acceptedAt) earliestInvite.set(key, invite);
  }

  const emails = new Set([...env, ...rows.keys(), ...users.keys()]);
  const people: PersonView[] = [];

  for (const email of emails) {
    const row = rows.get(email);
    const user = users.get(email);
    const admitted = env.has(email) || row !== undefined;
    const invite = earliestInvite.get(email);

    const status: PersonStatus = admitted ? (user ? "access" : "never-signed-up") : "no-access";
    const source: PersonSource = env.has(email)
      ? { kind: "env" }
      : row?.note === APPROVED_NOTE
        ? { kind: "approved" }
        : invite
          ? { kind: "invited", tripName: invite.tripName, ownerName: invite.ownerName }
          : { kind: "unknown" };
    const joined = user?.createdAt ?? row?.createdAt ?? null;

    people.push({
      email,
      name: user?.name ?? null,
      userId: user?.id ?? null,
      status,
      source,
      joinedAt: joined ? joined.toISOString() : null,
      lastSeenAt: user?.lastSeenAt ? user.lastSeenAt.toISOString() : null,
      tripsOwned: user?.tripsOwned ?? 0,
      tripsOn: user?.tripsOn ?? 0,
      revokeId: row ? row.id : env.has(email) ? `env:${email}` : null,
    });
  }

  return people.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.lastSeenAt === b.lastSeenAt ? 0 : a.lastSeenAt === null ? 1 : b.lastSeenAt === null ? -1 : b.lastSeenAt.localeCompare(a.lastSeenAt)) ||
      a.email.localeCompare(b.email),
  );
}
