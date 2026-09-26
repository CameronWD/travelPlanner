import { describe, expect, it } from "vitest";
import { feedbackSite, siteLabel, siteOf } from "./feedback-site";

describe("feedbackSite", () => {
  it("production is main", () => {
    expect(feedbackSite({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe("main");
  });
  it("a preview is its branch", () => {
    expect(feedbackSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "beta" })).toBe("beta");
    expect(feedbackSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: " feat/x " })).toBe("feat/x");
  });
  it("a preview with no branch is 'preview'", () => {
    expect(feedbackSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "" })).toBe("preview");
    expect(feedbackSite({ VERCEL_ENV: "preview" })).toBe("preview");
  });
  it("anything else is local", () => {
    expect(feedbackSite({})).toBe("local");
    expect(feedbackSite({ VERCEL_ENV: "development" })).toBe("local");
  });
});

describe("siteOf / siteLabel", () => {
  it("a note with no site counts as main", () => {
    expect(siteOf(null)).toBe("main");
    expect(siteOf("beta")).toBe("beta");
  });
  it("labels", () => {
    expect(siteLabel("main")).toBe("Main");
    expect(siteLabel("beta")).toBe("Beta");
    expect(siteLabel("local")).toBe("Local");
    expect(siteLabel("feat/x")).toBe("feat/x");
  });
});
