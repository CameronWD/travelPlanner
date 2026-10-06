import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/stops", () => ({
  createStop: vi.fn().mockResolvedValue({ success: true }),
  updateStop: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
const findPlaces = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));
import { createStop, updateStop } from "@/server/actions/stops";

import { StopFormDialog } from "./stop-form-dialog";

const baseProps = {
  tripId: "trip-1",
  open: true,
  onOpenChange: vi.fn(),
};

describe("StopFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
  });

  it("submitting with empty name calls createStop with name '' (no client-side guard — validation is server-side)", async () => {
    // The component has no client-side empty-name guard: it passes the raw value
    // to the server action and relies on server validation to reject it.
    // This test documents and pins that behaviour.
    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    // Submit immediately with the name field empty
    await user.click(screen.getByRole("button", { name: /add stop/i }));

    // createStop IS called — empty string reaches the server action
    expect(createStop).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ mode: "rough", name: "" }),
      undefined,
    );
  });

  it("submitting valid rough-mode input calls createStop with the expected payload", async () => {
    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    // Fill in the place name (mode defaults to "rough")
    const nameInput = screen.getByPlaceholderText(/e\.g\. london/i);
    await user.type(nameInput, "Paris");

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    expect(createStop).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        mode: "rough",
        name: "Paris",
      }),
      undefined,
    );
  });

  it("a server-returned field error is displayed after submit", async () => {
    // Override createStop to return a field error for this test
    const { createStop: mockCreateStop } = await import("@/server/actions/stops");
    (mockCreateStop as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { name: ["Name is too short"] },
    });

    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    const nameInput = screen.getByPlaceholderText(/e\.g\. london/i);
    await user.type(nameInput, "X");

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    expect(await screen.findByText("Name is too short")).toBeInTheDocument();
  });

  it("a field error wires aria-invalid to the control via the Field error slot", async () => {
    const { createStop: mockCreateStop } = await import("@/server/actions/stops");
    (mockCreateStop as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { name: ["Name is required"] },
    });

    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    // Error message appears
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    // Control gets aria-invalid
    const nameInput = screen.getByPlaceholderText(/e\.g\. london/i);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
  });

  it("a server-returned _form error appears with role=alert", async () => {
    const { createStop: mockCreateStop } = await import("@/server/actions/stops");
    (mockCreateStop as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Something went wrong on the server"] },
    });

    const user = userEvent.setup();
    render(<StopFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add stop/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on the server");
  });

  it("is the wide dialog with Place name beside Country, and Nights beside Chapter (spec 2026-10-05 §D)", () => {
    render(<StopFormDialog {...baseProps} />);
    expect(screen.getByRole("dialog").className.split(/\s+/)).toContain("sm:max-w-dialog-lg");
    const place = screen.getByPlaceholderText(/e\.g\. london/i).closest("[data-pair='place']");
    expect(place).toContainElement(screen.getByPlaceholderText(/e\.g\. united kingdom/i));
    expect(place!.className).toContain("sm:grid-cols-2");
    expect(place!.className).not.toMatch(/(^|\s)grid-cols-2/);
    const rough = screen.getByLabelText(/nights \(rough\)/i).closest("[data-pair='rough']");
    expect(rough).not.toBeNull();
    expect(rough).toHaveTextContent("Chapter");
  });

  describe("place search on edit (spec 2026-10-06 §L)", () => {
    const LONDON = {
      id: "stop-1", name: "London", country: "United Kingdom", timezone: "Europe/London",
      arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false, chapterId: null, sortOrder: 0, notes: null, lat: 51.5, lng: -0.12,
    };

    it("a pick sets name, country, point and timezone", async () => {
      findPlaces.mockResolvedValue({ status: "ok", candidates: [
        { name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" },
      ] });
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Kyo");
      await user.click(await screen.findByRole("option", { name: /Kyoto/ }));
      expect(screen.getByPlaceholderText(/e\.g\. united kingdom/i)).toHaveValue("Japan");
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(updateStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({
        mode: "scheduled", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp", timezone: "Asia/Tokyo",
      }));
    });

    it("typing without picking sends no point, so the save re-geocodes as before", async () => {
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Leeds");
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      const input = vi.mocked(updateStop).mock.calls[0][1];
      expect(input).toEqual(expect.objectContaining({ name: "Leeds" }));
      expect(input).not.toHaveProperty("lat");
    });

    it("editing Country after a pick drops the picked point, so the save re-geocodes", async () => {
      findPlaces.mockResolvedValue({ status: "ok", candidates: [
        { name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" },
      ] });
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Kyo");
      await user.click(await screen.findByRole("option", { name: /Kyoto/ }));
      const country = screen.getByPlaceholderText(/e\.g\. united kingdom/i);
      await user.clear(country);
      await user.type(country, "China");
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      const input = vi.mocked(updateStop).mock.calls[0][1];
      expect(input).toEqual(expect.objectContaining({ name: "Kyoto", country: "China" }));
      expect(input).not.toHaveProperty("lat");
      expect(input).not.toHaveProperty("lng");
      expect(input).not.toHaveProperty("countryCode");
    });

    it("labels the modes like the add sheet: Exact dates / Roughly", () => {
      render(<StopFormDialog {...baseProps} />);
      expect(screen.getByRole("radio", { name: "Exact dates" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Roughly" })).toBeInTheDocument();
    });
  });
});
