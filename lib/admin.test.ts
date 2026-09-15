import { describe, it, expect, afterEach } from "vitest";
import { isAdminEmail } from "./admin";

const ORIGINAL = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe("isAdminEmail", () => {
  it("is false for everyone when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("cam@example.com")).toBe(false);
  });

  it("is false for everyone when ADMIN_EMAILS is empty or whitespace", () => {
    process.env.ADMIN_EMAILS = "   ";
    expect(isAdminEmail("cam@example.com")).toBe(false);
  });

  it("recognises a listed email", () => {
    process.env.ADMIN_EMAILS = "cam@example.com";
    expect(isAdminEmail("cam@example.com")).toBe(true);
  });

  it("recognises one of several, ignoring surrounding whitespace", () => {
    process.env.ADMIN_EMAILS = " a@example.com , cam@example.com ";
    expect(isAdminEmail("cam@example.com")).toBe(true);
    expect(isAdminEmail("a@example.com")).toBe(true);
  });

  it("matches case-insensitively, since email casing is not significant here", () => {
    process.env.ADMIN_EMAILS = "Cam@Example.COM";
    expect(isAdminEmail("cam@example.com")).toBe(true);
  });

  it("rejects an unlisted email", () => {
    process.env.ADMIN_EMAILS = "cam@example.com";
    expect(isAdminEmail("someone@example.com")).toBe(false);
  });

  it("rejects null and undefined rather than throwing", () => {
    process.env.ADMIN_EMAILS = "cam@example.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("never treats the empty string as a match, even against a trailing comma", () => {
    // "a@example.com," splits to ["a@example.com", ""] — an empty candidate
    // must not match a user whose email is somehow empty.
    process.env.ADMIN_EMAILS = "a@example.com,";
    expect(isAdminEmail("")).toBe(false);
  });
});
