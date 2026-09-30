import { describe, it, expect } from "vitest";
import { shareTraveller, avatarInput } from "./share-traveller";
import { travellerImageUrl } from "./traveller";

const cam = {
  id: "u1", name: "Cam Williams", displayName: "Cameron", image: "https://lh3.example/cam.png",
  photoKey: "avatars/u1.jpg", photoUpdatedAt: new Date(5000), photoFocalX: 0.3, photoFocalY: 0.6,
  email: "cam@example.com",
};

describe("shareTraveller (ADR 0051 amendment 2026-09-30)", () => {
  it("never carries an email, and names by display name", () => {
    const t = shareTraveller(cam, { token: "tok", showPhoto: true });
    expect(JSON.stringify(t)).not.toContain("cam@example.com");
    expect(t.name).toBe("Cameron");
    expect(t.firstName).toBe("Cameron");
  });
  it("with the dial off there is no photo at all", () => {
    expect(shareTraveller(cam, { token: "tok", showPhoto: false }).image).toBeNull();
  });
  it("with the dial off there is no focal point either (it would imply an uploaded photo)", () => {
    const t = shareTraveller(cam, { token: "tok", showPhoto: false });
    expect(t.focalX).toBeNull();
    expect(t.focalY).toBeNull();
    const on = shareTraveller(cam, { token: "tok", showPhoto: true });
    expect([on.focalX, on.focalY]).toEqual([0.3, 0.6]);
  });
  it("an uploaded photo goes through the link-scoped route, never /api/avatars", () => {
    const t = shareTraveller(cam, { token: "tok", showPhoto: true });
    expect(t.image).toBe("/share/tok/traveller-photo/u1?v=5000");
    expect(travellerImageUrl(avatarInput(t))).toBe("/share/tok/traveller-photo/u1?v=5000");
  });
  it("falls back to the provider picture, then nothing", () => {
    expect(shareTraveller({ ...cam, photoKey: null }, { token: "tok", showPhoto: true }).image).toBe("https://lh3.example/cam.png");
    expect(shareTraveller({ ...cam, photoKey: null, image: null }, { token: "tok", showPhoto: true }).image).toBeNull();
  });
  it("never falls back to the email local-part for a name", () => {
    const t = shareTraveller({ id: "u2", name: null, image: null, email: "secret.person@example.com" }, { token: "tok", showPhoto: false });
    expect(t.name).toBe("Traveller");
  });
});
