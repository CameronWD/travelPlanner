import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any dynamic import of lib/push
// ---------------------------------------------------------------------------

const sendNotificationMock = vi.fn();
const setVapidDetailsMock = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
  setVapidDetails: setVapidDetailsMock,
  sendNotification: sendNotificationMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STUB_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/stub",
  p256dh: "stub-p256dh",
  auth: "stub-auth",
};

const STUB_PAYLOAD = JSON.stringify({ title: "Test", body: "Body", url: "/" });

describe("buildNotificationPayload", () => {
  it("returns a JSON string with title, body, url", async () => {
    // Reset env to ensure clean import
    const { buildNotificationPayload } = await import("@/lib/push");
    const result = buildNotificationPayload({
      title: "Flight reminder",
      body: "Board in 1h",
      url: "/trips/abc/today",
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      title: "Flight reminder",
      body: "Board in 1h",
      url: "/trips/abc/today",
    });
  });

  it("serialises correctly for non-ASCII strings", async () => {
    const { buildNotificationPayload } = await import("@/lib/push");
    const result = buildNotificationPayload({
      title: "日本語タイトル",
      body: "Hello 🌏",
      url: "/trips/jp",
    });
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe("日本語タイトル");
    expect(parsed.body).toBe("Hello 🌏");
  });
});

describe("isPushConfigured", () => {
  it("returns false when VAPID env vars are absent", async () => {
    // Ensure env is empty
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    // Re-import to pick up stubs
    vi.resetModules();
    const { isPushConfigured } = await import("@/lib/push");
    expect(isPushConfigured()).toBe(false);
  });

  it("returns true when all VAPID env vars are set", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");

    vi.resetModules();
    const { isPushConfigured } = await import("@/lib/push");
    expect(isPushConfigured()).toBe(true);

    // Cleanup
    vi.unstubAllEnvs();
  });
});

describe("sendPush", () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
    setVapidDetailsMock.mockReset();
    vi.resetModules();
  });

  it("returns { sent: false, skipped: true } when VAPID env vars are not set", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    const { sendPush } = await import("@/lib/push");
    const result = await sendPush(STUB_SUB, STUB_PAYLOAD);

    expect(result).toEqual({ sent: false, skipped: true });
    expect(sendNotificationMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("calls webpush.sendNotification and returns { sent: true } when configured", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");

    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    const { sendPush } = await import("@/lib/push");
    const result = await sendPush(STUB_SUB, STUB_PAYLOAD);

    expect(result).toEqual({ sent: true });
    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "pub-key",
      "priv-key",
    );
    expect(sendNotificationMock).toHaveBeenCalledWith(
      {
        endpoint: STUB_SUB.endpoint,
        keys: { p256dh: STUB_SUB.p256dh, auth: STUB_SUB.auth },
      },
      STUB_PAYLOAD,
    );

    vi.unstubAllEnvs();
  });

  it("returns { sent: false, gone: true } on 410 statusCode (expired subscription)", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");

    const goneErr = Object.assign(new Error("Gone"), { statusCode: 410 });
    sendNotificationMock.mockRejectedValue(goneErr);

    const { sendPush } = await import("@/lib/push");
    const result = await sendPush(STUB_SUB, STUB_PAYLOAD);

    expect(result).toEqual({ sent: false, gone: true });

    vi.unstubAllEnvs();
  });

  it("returns { sent: false, gone: true } on 404 statusCode (not found)", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");

    const notFoundErr = Object.assign(new Error("Not Found"), {
      statusCode: 404,
    });
    sendNotificationMock.mockRejectedValue(notFoundErr);

    const { sendPush } = await import("@/lib/push");
    const result = await sendPush(STUB_SUB, STUB_PAYLOAD);

    expect(result).toEqual({ sent: false, gone: true });

    vi.unstubAllEnvs();
  });

  it("returns { sent: false } on other errors (no throw)", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");

    sendNotificationMock.mockRejectedValue(new Error("Network error"));

    const { sendPush } = await import("@/lib/push");
    const result = await sendPush(STUB_SUB, STUB_PAYLOAD);

    expect(result).toEqual({ sent: false });

    vi.unstubAllEnvs();
  });
});
