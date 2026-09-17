import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `20260916000000_digest_and_alarms` runs unattended inside the Vercel
 * production build (`vercel.json` → `prisma migrate deploy`), so there is no
 * moment at which a human looks at it before it touches real rows.
 *
 * It opened with `DELETE FROM "Reminder";`, justified by a row count taken
 * three weeks before the deploy and recorded only in a SQL comment. A Reminder
 * is a note a Traveller wrote by hand; the columns being dropped hold
 * everything the new shape needs, so there is no reason to destroy one. These
 * assertions are about the ORDER that makes the non-destructive version
 * correct — a backfill that reads a column dropped above it fails the deploy
 * halfway through, which on this path means a half-migrated production schema.
 */
const FILE = readFileSync(
  path.join(
    __dirname,
    "migrations",
    "20260916000000_digest_and_alarms",
    "migration.sql",
  ),
  "utf8",
);

/**
 * Statements only. The file's comment explains what it no longer does, in the
 * same words the assertions look for — matching against the comment would make
 * this test pass on a file that talks about being safe.
 */
const SQL = FILE.replace(/^\s*--.*$/gm, "");

/** Index of the first line matching `needle`, asserted to exist. */
function at(needle: string): number {
  const index = SQL.indexOf(needle);
  expect(index, `migration.sql is missing: ${needle}`).toBeGreaterThan(-1);
  return index;
}

describe("digest_and_alarms migration", () => {
  it("never empties the Reminder table", () => {
    // Any unqualified delete, however it is spaced.
    expect(SQL).not.toMatch(/DELETE\s+FROM\s+"Reminder"\s*;/i);
  });

  it("deletes only the retired COST_DUE marker rows", () => {
    const deletes = SQL.match(/DELETE\s+FROM\s+"Reminder"[^;]*;/gi) ?? [];
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain(`"targetType" = 'COST_DUE'`);
  });

  it("adds date as nullable, backfills it, then makes it NOT NULL", () => {
    const add = at(`ALTER TABLE "Reminder" ADD COLUMN "date" TEXT;`);
    const backfill = at(`UPDATE "Reminder" SET "date"`);
    const notNull = at(`ALTER TABLE "Reminder" ALTER COLUMN "date" SET NOT NULL;`);

    expect(add).toBeLessThan(backfill);
    expect(backfill).toBeLessThan(notNull);
  });

  it("drops fireAt and targetType only after the statements that read them", () => {
    const backfill = at(`UPDATE "Reminder" SET "date"`);
    const costDueDelete = at(`DELETE FROM "Reminder" WHERE "targetType"`);

    expect(backfill).toBeLessThan(at(`ALTER TABLE "Reminder" DROP COLUMN "fireAt";`));
    expect(costDueDelete).toBeLessThan(
      at(`ALTER TABLE "Reminder" DROP COLUMN "targetType";`),
    );
  });

  it("still lands on the shape prisma/schema.prisma declares", () => {
    for (const column of ["fireAt", "sent", "targetType", "targetId"]) {
      expect(SQL).toContain(`ALTER TABLE "Reminder" DROP COLUMN "${column}";`);
    }
    expect(SQL).toContain(`CREATE INDEX "Reminder_date_idx" ON "Reminder"("date");`);
  });
});
