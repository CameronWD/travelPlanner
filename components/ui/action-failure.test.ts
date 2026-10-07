import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { firstErrorMessage, toastRefused, toastRejected, SOMETHING_WENT_WRONG } from "./action-failure";
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
});

describe("toastRefused", () => {
  it("toasts the server's own words from a field-error dict", () => {
    toastRefused({ _: ["Nope."] }, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Nope." });
  });
  it("toasts a plain string reason as-is", () => {
    toastRefused("File is someone else's.", "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "File is someone else's." });
  });
  it("uses the fallback when there's no reason", () => {
    toastRefused(undefined, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't do that." });
  });
});

describe("toastRejected", () => {
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
