import { afterEach, describe, expect, it, vi } from "vitest";
import { mailConfigured, sendMail } from "./mail";

const ENV = { AUTH_RESEND_KEY: "re_test", AUTH_RESEND_FROM: "Teepee <signin@teepee.test>" };
const MSG = { to: "friend@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

afterEach(() => vi.restoreAllMocks());

describe("mailConfigured", () => {
  it("needs both vars", () => {
    expect(mailConfigured(ENV)).toBe(true);
    expect(mailConfigured({ AUTH_RESEND_KEY: "re_test" })).toBe(false);
    expect(mailConfigured({ AUTH_RESEND_FROM: "x" })).toBe(false);
    expect(mailConfigured({})).toBe(false);
  });
});

describe("sendMail", () => {
  it("POSTs to Resend with the from/to/subject/html/text and reports sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(sendMail(MSG, ENV)).resolves.toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer re_test", "Content-Type": "application/json" },
      body: JSON.stringify({ from: ENV.AUTH_RESEND_FROM, to: MSG.to, subject: MSG.subject, html: MSG.html, text: MSG.text }),
    });
  });

  it("reports a non-2xx as not sent, with the status and body, without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(sendMail(MSG, ENV)).resolves.toEqual({ sent: false, error: "Resend error 500: nope" });
  });

  it("reports a rejected fetch as not sent", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(sendMail(MSG, ENV)).resolves.toEqual({ sent: false, error: "offline" });
  });

  it("does not fetch at all when unconfigured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await sendMail(MSG, {});
    expect(result.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
