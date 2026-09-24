import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "./site-url";

describe("siteUrl", () => {
  const prevAppUrl = process.env.APP_URL;
  const prevVercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  afterEach(() => {
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
    if (prevVercelUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevVercelUrl;
  });

  it("prefers APP_URL, stripping a trailing slash", () => {
    process.env.APP_URL = "https://teepee.example.com/";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "some-other-host.vercel.app";
    expect(siteUrl()).toBe("https://teepee.example.com");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when APP_URL is unset", () => {
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "teepee-git-main.vercel.app";
    expect(siteUrl()).toBe("https://teepee-git-main.vercel.app");
  });

  it("falls back to localhost when neither is set", () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
