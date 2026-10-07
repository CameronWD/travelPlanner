/** docker-compose.yml's database — the same URL as .env.example's DATABASE_URL. */
export const DOCKER_COMPOSE_DATABASE_URL = "postgresql://trip:trip@localhost:5432/trip?schema=public";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The database the integration tier runs against: DATABASE_URL when set,
 * else the docker-compose one. Throws for any non-local host: these tests
 * delete rows, and a shell can easily be holding a production URL
 * (scripts/load-env.ts prefers .env.production.local).
 */
export function integrationDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.DATABASE_URL?.trim() || DOCKER_COMPOSE_DATABASE_URL;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; the integration tests need the docker-compose Postgres.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Integration tests only run against a local Postgres (docker compose up -d); DATABASE_URL points at "${host}".`,
    );
  }
  return url;
}
