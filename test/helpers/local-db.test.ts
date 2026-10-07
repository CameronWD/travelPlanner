import { describe, expect, it } from "vitest";
import { DOCKER_COMPOSE_DATABASE_URL, integrationDatabaseUrl } from "./local-db";

describe("integrationDatabaseUrl", () => {
  it("defaults to the docker-compose database", () => {
    expect(integrationDatabaseUrl({})).toBe(DOCKER_COMPOSE_DATABASE_URL);
    expect(DOCKER_COMPOSE_DATABASE_URL).toBe("postgresql://trip:trip@localhost:5432/trip?schema=public");
  });

  it("keeps a local DATABASE_URL (CI's service container)", () => {
    expect(integrationDatabaseUrl({ DATABASE_URL: "postgresql://trip:trip@127.0.0.1:5432/trip" })).toBe(
      "postgresql://trip:trip@127.0.0.1:5432/trip",
    );
  });

  it("refuses any non-local host — the tests delete rows", () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" })).toThrow(/local Postgres/);
  });

  it("refuses a URL it cannot parse", () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });
});
