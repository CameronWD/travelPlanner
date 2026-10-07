/**
 * Spec 2026-10-06 §P: the Plan's ten open-on-demand dialogs are not in the
 * manager's initial import graph. Each dialog module is mocked with a
 * factory that records being loaded; `next/dynamic` is stubbed to never call
 * its loader. Importing the manager must not load any of them.
 */
import { describe, it, expect, vi } from "vitest";

const loaded = vi.hoisted(() => [] as string[]);

vi.mock("next/dynamic", () => ({ default: () => () => null }));

vi.mock("@/components/plan/stay-dialog", () => { loaded.push("stay-dialog"); return { StayDialog: () => null }; });
vi.mock("@/components/plan/stop-extras-dialog", () => { loaded.push("stop-extras-dialog"); return { StopExtrasDialog: () => null }; });
vi.mock("@/components/plan/stop-actions-sheet", () => { loaded.push("stop-actions-sheet"); return { StopActionsSheet: () => null }; });
vi.mock("@/components/plan/mobile/stop-sheet", () => { loaded.push("stop-sheet"); return { StopSheet: () => null }; });
vi.mock("@/components/trip/stop-form-dialog", () => { loaded.push("stop-form-dialog"); return { StopFormDialog: () => null }; });
vi.mock("@/components/trip/transport-form-dialog", () => { loaded.push("transport-form-dialog"); return { TransportFormDialog: () => null }; });
vi.mock("@/components/trip/accommodation-form-dialog", () => { loaded.push("accommodation-form-dialog"); return { AccommodationFormDialog: () => null }; });
vi.mock("@/components/trip/add-reminder-dialog", () => { loaded.push("add-reminder-dialog"); return { AddReminderDialog: () => null }; });
vi.mock("@/components/trip/item-form-dialog", () => { loaded.push("item-form-dialog"); return { ItemFormDialog: () => null }; });
vi.mock("@/components/trip/delete-stop-dialog", () => { loaded.push("delete-stop-dialog"); return { DeleteStopDialog: () => null }; });

// The manager's server actions (each would import lib/db → Postgres).
vi.mock("@/server/actions/stops", () => ({}));
vi.mock("@/server/actions/transport", () => ({}));
vi.mock("@/server/actions/accommodation", () => ({}));
vi.mock("@/server/actions/notes", () => ({}));
vi.mock("@/server/actions/attachments", () => ({}));
vi.mock("@/server/actions/costs", () => ({}));
vi.mock("@/server/actions/chapters", () => ({}));
vi.mock("@/server/actions/reminders", () => ({}));
vi.mock("@/server/actions/items", () => ({}));
vi.mock("@/server/actions/votes", () => ({}));
vi.mock("@/server/actions/day-titles", () => ({}));
vi.mock("@/server/actions/item-photo", () => ({}));
vi.mock("@/server/actions/places", () => ({}));

describe("ItineraryManager initial import graph (spec 2026-10-06 §P)", () => {
  // The Plan editor's first import is slow to transform (~2.9s).
  it("loads none of the ten Plan dialogs up front", async () => {
    const mod = await import("./itinerary-manager");
    expect(typeof mod.ItineraryManager).toBe("function");
    expect(loaded).toEqual([]);
  }, 30_000);
});
