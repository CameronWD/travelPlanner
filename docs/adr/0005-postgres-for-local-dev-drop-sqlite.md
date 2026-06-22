# Postgres for local dev too — drop SQLite, single migration history

When realizing the production deployment (ADR 0003's Postgres + R2 + free-tier target),
we moved **local development onto Postgres as well** (via a `docker-compose` container)
rather than keeping the SQLite-on-`better-sqlite3` dev setup and switching providers only
in production. Prisma has a single `provider` and a single, provider-specific migration
history (`migration_lock.toml` pins it), so maintaining both a SQLite history for local and
a Postgres history for prod from one schema is not cleanly possible — you pick one engine.

We chose dev/prod parity: the same engine we ship on is the engine we test against, which
removes a class of "worked on SQLite, broke on Postgres" surprises and lets prod use safe,
versioned `prisma migrate deploy` instead of unversioned `db push`. The cost is that local
dev now requires Docker (a Postgres container) instead of a zero-dependency SQLite file —
the README quickstart loses its "no external dependencies" property. We accepted that because
production is where the app is actually used, and protecting real trip data with reversible
migrations outweighs local convenience.

## Consequences

- `better-sqlite3` and `@prisma/adapter-better-sqlite3` are removed; `lib/db.ts` uses
  `@prisma/adapter-pg`. The committed migration baseline is Postgres DDL.
- Local dev needs `docker compose up` (or a remote Postgres connection string) before
  `npm run dev` / tests that hit a real DB. The unit suite is unaffected — it mocks `@/lib/db`.
- Neon's pooled connection is used by the running app (`DATABASE_URL`); migrations use the
  direct connection (`DIRECT_URL`).
