import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_DETAILS,
  MAX_APPEAR_MS,
  MAX_DAY_OFFSET,
  MAX_ID_CHARS,
  MORE_ROWS,
  MORE_ROW_BY_LABEL,
  OPEN_MODES,
  USAGE_ACTIONS,
  USAGE_DETAILS,
  USAGE_PHASES,
  USAGE_SCREENS,
  USAGE_SITES,
} from "./lists";

const SQL = readFileSync(path.join(process.cwd(), "prisma/migrations/20261124120000_usage/migration.sql"), "utf8");

function checkedValues(column: string): string[] {
  const constraint = SQL.match(new RegExp(`"UsageRecord_${column}_check"\\s+CHECK \\(([^;]*)\\);`));
  if (!constraint) throw new Error(`No UsageRecord_${column}_check in the migration`);
  const list = constraint[1].match(new RegExp(`"${column}" IN \\(([^)]*)\\)`));
  if (!list) throw new Error(`UsageRecord_${column}_check has no IN list`);
  return [...list[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

function bounds(name: string, expression: string): [number, number] {
  const constraint = SQL.match(new RegExp(`"UsageRecord_${name}_check"\\s+CHECK \\(([^;]*)\\);`));
  if (!constraint) throw new Error(`No UsageRecord_${name}_check in the migration`);
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const range = constraint[1].match(new RegExp(`${escaped} BETWEEN (-?\\d+) AND (-?\\d+)`));
  if (!range) throw new Error(`UsageRecord_${name}_check has no range for ${expression}`);
  return [Number(range[1]), Number(range[2])];
}

const LISTS = {
  screen: USAGE_SCREENS,
  action: USAGE_ACTIONS,
  detail: USAGE_DETAILS,
  phase: USAGE_PHASES,
  mode: OPEN_MODES,
  site: USAGE_SITES,
} as const;

describe("the Usage lists", () => {
  it.each(Object.entries(LISTS))("the migration's %s CHECK holds exactly the list", (column, list) => {
    const values = checkedValues(column);
    expect(values).toHaveLength(list.length);
    expect(new Set(values)).toEqual(new Set(list));
  });

  it.each(Object.entries(LISTS))("%s has no duplicate", (_, list) => {
    expect(new Set(list).size).toBe(list.length);
  });

  it.each(Object.entries(LISTS))("every %s value is lowercase kebab-case", (_, list) => {
    for (const value of list) expect(value).toMatch(/^[a-z][a-z-]*$/);
  });

  it("the migration's number and length limits are the constants", () => {
    expect(bounds("numbers", '"appearMs"')).toEqual([0, MAX_APPEAR_MS]);
    expect(bounds("numbers", '"dayOffset"')).toEqual([-MAX_DAY_OFFSET, MAX_DAY_OFFSET]);
    expect(bounds("ids", 'char_length("userId")')).toEqual([1, MAX_ID_CHARS]);
    expect(bounds("ids", 'char_length("tripId")')).toEqual([1, MAX_ID_CHARS]);
  });

  it("every action with details is an action", () => {
    for (const action of Object.keys(ACTION_DETAILS)) expect(USAGE_ACTIONS).toContain(action);
  });

  it("every More row label maps to a More row", () => {
    for (const row of Object.values(MORE_ROW_BY_LABEL)) expect(MORE_ROWS).toContain(row);
  });

  it("the Day view and the More page are trip screens, What’s new is an app screen", () => {
    expect(USAGE_SCREENS).toEqual(expect.arrayContaining(["day", "more", "whats-new"]));
  });
});
