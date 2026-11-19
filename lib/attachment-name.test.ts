import { describe, it, expect } from "vitest";
import { splitFileName } from "./attachment-name";

describe("splitFileName", () => {
  it("keeps the end of the stem and the extension together", () => {
    expect(splitFileName("Ticket-outbound-final.pdf")).toEqual({ head: "Ticket-outbound", tail: "-final.pdf" });
  });
  it("a short name without a dot is all tail", () => {
    expect(splitFileName("notes")).toEqual({ head: "", tail: "notes" });
  });
  it("a long name without a dot keeps its last 6 characters", () => {
    expect(splitFileName("boarding-passes")).toEqual({ head: "boarding-", tail: "passes" });
  });
  it("a dotfile has no extension", () => {
    expect(splitFileName(".env")).toEqual({ head: "", tail: ".env" });
  });
  it("a short stem is all tail", () => {
    expect(splitFileName("scan.jpeg")).toEqual({ head: "", tail: "scan.jpeg" });
  });
  it("an ending after the dot longer than 5 characters is not an extension", () => {
    expect(splitFileName("v1.2.backup-copy")).toEqual({ head: "v1.2.backu", tail: "p-copy" });
  });
});
