import { vi, type Mock } from "vitest";

const METHODS = ["findUnique", "findFirst", "findMany", "count", "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "aggregate"] as const;
type Method = (typeof METHODS)[number];
type MockDelegate = Record<Method, Mock>;
export type MockDb<K extends string> = Record<K, MockDelegate> & {
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
};

/**
 * One `@/lib/db` mock for every test that needs one (spec 2026-10-14 Q10).
 * `findMany` resolves `[]`, `count` resolves `0`, every other method resolves
 * `null`, until a test says otherwise with `mockResolvedValue`. Use as:
 *
 *   const db = vi.hoisted(() => mockDb(["trip", "stop"]));
 *   vi.mock("@/lib/db", () => ({ db }));
 *
 * `vi.hoisted` runs before imports are resolved, so it cannot `import` this
 * module at hoist time in every setup; this form works because `mockDb` has
 * no dependency on anything else hoisted or imported, so calling it directly
 * inside the `vi.hoisted` factory is safe. If a particular test file's
 * bundler disagrees, fall back to: import `mockDb` normally, declare
 * `let db: MockDb<...>`, and call `vi.mock("@/lib/db", () => ({ db: (db = mockDb([...])) }))`.
 */
export function mockDb<K extends string>(delegates: readonly K[]): MockDb<K> {
  const out = {} as Record<string, unknown>;
  for (const name of delegates) {
    const d = {} as Record<string, Mock>;
    for (const m of METHODS) {
      d[m] = vi.fn().mockResolvedValue(m === "findMany" ? [] : m === "count" ? 0 : null);
    }
    out[name] = d;
  }
  out.$transaction = vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(out) : Promise.all(arg as Promise<unknown>[])));
  out.$queryRaw = vi.fn().mockResolvedValue([]);
  out.$executeRaw = vi.fn().mockResolvedValue(0);
  return out as MockDb<K>;
}
