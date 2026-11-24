import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/trip-refresh", () => ({ requestTripRefresh: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { requestTripRefresh } from "@/lib/trip-refresh";
import { firstErrorMessage, formError, toastRefused, toastRejected, SOMETHING_WENT_WRONG, NOTHING_CHANGED } from "./action-failure";
import { OFFLINE_MESSAGE } from "./failure-message";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, writable: true, configurable: true });
}

afterEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

describe("firstErrorMessage", () => {
  it("returns the first message across every field", () => {
    expect(firstErrorMessage({ name: [], _: ["Only the trip owner can delete a Stop."] }, "fallback")).toBe(
      "Only the trip owner can delete a Stop.",
    );
  });
  it("falls back when there is no message", () => {
    expect(firstErrorMessage({}, "fallback")).toBe("fallback");
    expect(firstErrorMessage(undefined, "fallback")).toBe("fallback");
  });
  it("reads a failure result or a bare dict", () => {
    expect(firstErrorMessage({ success: false, errors: { name: ["Too long"] } }, "fallback")).toBe("Too long");
    expect(firstErrorMessage({ name: ["Too long"] }, "fallback")).toBe("Too long");
    expect(firstErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("formError", () => {
  it("reads the form-level key off a failure result or a bare dict", () => {
    expect(formError({ success: false, errors: { _: ["Form-level"] } })).toBe("Form-level");
    expect(formError({ name: ["field"] })).toBeUndefined();
  });
});

describe("toastRefused", () => {
  it("does not ask the Trip to refresh", () => {
    toastRefused({ _: ["Nope."] }, "fallback");
    expect(requestTripRefresh).not.toHaveBeenCalled();
  });
  it("toasts the server's own words from a field-error dict", () => {
    toastRefused({ _: ["Nope."] }, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Nope." });
  });
  it("toasts the server's own words from a full ActionFailure", () => {
    toastRefused({ success: false, errors: { _: ["File is someone else's."] } }, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "File is someone else's." });
  });
  it("uses the fallback when there's no reason", () => {
    toastRefused(undefined, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't do that." });
  });
});

describe("failure copy", () => {
  it("a refusal keeps the old wording: the server answered, so nothing changed", () => {
    expect(NOTHING_CHANGED).toBe("Couldn’t do that. Nothing changed. Try again.");
  });
  it("a rejection says it could not be confirmed, not that nothing changed", () => {
    expect(SOMETHING_WENT_WRONG).toBe("Couldn’t confirm that. Check it saved before trying again.");
  });
});

describe("toastRejected", () => {
  it("asks the Trip to refresh once", () => {
    toastRejected();
    expect(requestTripRefresh).toHaveBeenCalledTimes(1);
  });
  it("online: the caller's wording (default: nothing was changed)", () => {
    toastRejected();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: SOMETHING_WENT_WRONG });
  });
  it("offline: names the connection", () => {
    setOnline(false);
    toastRejected("Couldn't delete that cost.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: OFFLINE_MESSAGE });
  });
});
