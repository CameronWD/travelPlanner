import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real Postgres (npm run test:integration): boots the REAL Better Auth
// instance in lib/auth.ts against the migrated schema (ADR 0071), so a model
// or column the Prisma adapter can't find fails here, then signs a Traveller
// in through the dev-login door and reads the session back with its cookie.
const EMAIL = "it-better-auth-dev-login@example.test";
const BASE = "http://localhost:3000";

type AuthModule = typeof import("@/lib/auth");
type DbModule = typeof import("@/lib/db");

describe.skipIf(process.env.INTEGRATION !== "1")("Better Auth dev login (real Postgres)", () => {
  let authServer: AuthModule["authServer"];
  let db: DbModule["db"];
  let userId: string;
  const prevEnv = { ...process.env };

  beforeAll(async () => {
    // lib/auth.ts reads these at import time.
    process.env.ALLOW_DEV_LOGIN = "true";
    process.env.AUTH_SECRET ||= "integration-secret-integration-secret-0123";
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    ({ db } = await import("@/lib/db"));
    ({ authServer } = await import("@/lib/auth"));
    await db.user.deleteMany({ where: { email: EMAIL } });
    userId = (await db.user.create({ data: { email: EMAIL, name: "Dev Login IT", isEmailVerified: true } })).id;
  });

  afterAll(async () => {
    await db.authSession.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    process.env = prevEnv;
  });

  it("sets a session cookie that get-session resolves to the Traveller", async () => {
    const res = await authServer.handler(
      new Request(`${BASE}/api/auth/dev-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ email: EMAIL }),
      }),
    );
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("better-auth.session_token="))).toBe(true);
    expect(await db.authSession.count({ where: { userId } })).toBe(1);

    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const sessionRes = await authServer.handler(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } }),
    );
    expect(sessionRes.status).toBe(200);
    const body = await sessionRes.json();
    expect(body.user).toMatchObject({ id: userId, email: EMAIL });
  });
});
