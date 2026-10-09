/**
 * Write tools for Reminders and Checklists (spec 2026-10-09, Task 14): the
 * Reminder lifecycle, the three Checklist flavours (Pre-trip checklist,
 * Packing list, Shopping list — CONTEXT.md "Checklist"), the Packing ↔
 * Shopping "Need to buy" bridge, reordering, and Packing templates.
 *
 * Every write delegates to the same server actions the app itself uses
 * (`server/actions/reminders`, `checklists`), which already resolve to the
 * acting Traveller inside a Claude connection (via `requireUser`/
 * `requireTripAccess`) and record Activity marked "via Claude" — these
 * tools add no access logic of their own.
 *
 * Ruling 4 (made-up id vs. non-member's id → identical NOT_FOUND_TEXT) is
 * already met by the actions themselves for every id-keyed tool here:
 * `requireReminderAccess`/`requireChecklistItemAccess` (reminders.ts,
 * checklists.ts) and `applyTemplate`'s ownership check all do
 * findUnique → `notFound()` → `requireTripAccess` (or an equivalent
 * ownership check that also ends in `notFound()`) before touching the row,
 * so there's nothing left for this file to pre-load for those tools. The
 * one exception is `update_reminder` — see below.
 *
 * `update_reminder` is PATCH, not replace (same ruling as Task 11's
 * `update_trip`/`update_stop`): `updateReminder` requires a full
 * `ReminderInput` — `title` and `date` are not optional on that schema, so
 * a caller that means to change only one of them would otherwise have the
 * other silently reset to... nothing valid (the call would just fail
 * validation, or worse, overwrite with an empty value if the caller forgot
 * to resend it). So this tool loads the current Reminder, merges only the
 * fields the caller actually supplied over it, and sends the action a
 * complete, merged `ReminderInput` instead. There's no way to *clear* an
 * existing `stopId` through this tool (the schema has no null for it,
 * `z.string().cuid().optional()` only) — that's a real gap in the action,
 * not something this tool can accept and silently drop, so it isn't
 * exposed at all; omitting `stopId` always means "leave it as is".
 *
 * `update_checklist_item` needs no such merge: `checklistItemUpdateSchema`
 * already treats every field as a genuine partial-update field (an absent
 * key means "leave unchanged"; `dueDate` additionally supports an explicit
 * clear, which `updateChecklistItem` maps from `""`). This tool exposes
 * that clear as `dueDate: null` instead of an empty string — more natural
 * for a tool caller — and forwards `""` to the action when it sees it.
 * `assignedToId` is deliberately not part of this tool's surface: it isn't
 * part of the brief's field list, and `get_checklists` (reads.ts) doesn't
 * return an assignee for an item either, so there would be no way for
 * Claude to see what it set or read back a member id to set it with.
 *
 * `add_shopping_item`: a standalone Shopping entry (CONTEXT.md "Shopping
 * list" — a thing to buy that is not also a Packing item, e.g. flight
 * snacks or a gift) is not a separate entity or action. It is created by
 * the exact same `addChecklistItem` the Pre-trip/Packing tools use, with
 * `kind: "SHOPPING"` (confirmed against the Shopping tab's own quick-add
 * form, components/trip/shopping-list.tsx `AddShoppingItemForm`). So this
 * tool is a thin, fixed-kind wrapper over `addChecklistItem` rather than a
 * dropped tool — `add_checklist_item`'s own `kind` is restricted to
 * `PRETRIP`/`PACKING` so the two tools don't overlap (a caller that means a
 * Shopping entry always has exactly one tool to reach for).
 *
 * The other sort of Shopping row — a Packing item marked "Need to buy" —
 * is not created here at all: it is an existing Packing item plus
 * `set_need_to_buy`, never a new row (CONTEXT.md "Shopping list").
 */
import { z } from "zod";
import { notFound } from "next/navigation";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { addReminder, updateReminder, deleteReminder } from "@/server/actions/reminders";
import {
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  setBuyState,
  deleteChecklistItem,
  reorderChecklistItem,
  saveAsTemplate,
  applyTemplate,
} from "@/server/actions/checklists";
import { buyStateSchema } from "@/lib/enums";
import type { ReminderInput } from "@/lib/validations/reminder";
import { runTool } from "../run-tool";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** `add_checklist_item`'s `kind` never includes "SHOPPING" — that's `add_shopping_item`'s job. */
const addableChecklistKind = z.enum(["PRETRIP", "PACKING"]);

// ---------------------------------------------------------------------------
// update_reminder patch helpers
// ---------------------------------------------------------------------------

type ReminderRow = { tripId: string; title: string; date: string; stopId: string | null };
type ReminderPatch = { title?: string; date?: string; stopId?: string };

/**
 * Loads the current Reminder for a patch, trip-access-checked. A missing
 * row reads as `notFound()` (mapped by `runTool` to the same "not found"
 * text a non-member's id gets), checked before the access check can run —
 * membership is then verified before any of the row's values are used.
 */
async function loadReminderForPatch(reminderId: string): Promise<ReminderRow> {
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
    select: { tripId: true, title: true, date: true, stopId: true },
  });
  if (!reminder) notFound();
  await requireTripAccess(reminder.tripId);
  return reminder;
}

/**
 * Merges a patch onto the current Reminder row. `stopId` is forwarded only
 * when the patch doesn't touch it and the current Reminder already has one
 * — `updateReminder` treats an absent key as "leave unchanged", so there's
 * no need to force the key in when there's nothing to carry forward.
 */
function mergeReminderPatch(current: ReminderRow, patch: ReminderPatch): ReminderInput {
  const stopId = patch.stopId !== undefined ? patch.stopId : (current.stopId ?? undefined);
  return {
    title: patch.title ?? current.title,
    date: patch.date ?? current.date,
    ...(stopId !== undefined ? { stopId } : {}),
  };
}

export function registerListWriteTools(server: McpServer): void {
  // ---------------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------------

  server.registerTool(
    "add_reminder",
    {
      title: "Add reminder",
      description:
        "Adds a dated note for the Traveller to see on Home and hear in the evening-before Digest. Carries a date, never a time. Pass stopId to say the note is about that Stop (it does not move the date).",
      inputSchema: {
        tripId: z.string(),
        title: z.string().trim().min(1),
        date: isoDate,
        stopId: z.string().optional(),
      },
    },
    ({ tripId, ...rest }) => runTool("add_reminder", () => addReminder(tripId, rest)),
  );

  server.registerTool(
    "update_reminder",
    {
      title: "Update reminder",
      description: "Changes only the fields you pass; fields you omit keep their current value.",
      inputSchema: {
        reminderId: z.string(),
        title: z.string().trim().min(1).optional(),
        date: isoDate.optional(),
        stopId: z.string().optional(),
      },
    },
    ({ reminderId, ...patch }) =>
      runTool("update_reminder", async () => {
        const current = await loadReminderForPatch(reminderId);
        return updateReminder(reminderId, mergeReminderPatch(current, patch));
      }),
  );

  server.registerTool(
    "delete_reminder",
    {
      title: "Delete reminder",
      description: "Permanently deletes a Reminder. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { reminderId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ reminderId }) => runTool("delete_reminder", () => deleteReminder(reminderId)),
  );

  // ---------------------------------------------------------------------
  // Checklists: Pre-trip checklist, Packing list, Shopping list
  // ---------------------------------------------------------------------

  server.registerTool(
    "add_checklist_item",
    {
      title: "Add checklist item",
      description:
        "Adds a tickable task to a trip's Pre-trip checklist or Packing list. Use add_shopping_item for a standalone Shopping list entry instead.",
      inputSchema: {
        tripId: z.string(),
        kind: addableChecklistKind,
        text: z.string().trim().min(1),
        dueDate: isoDate.optional(),
      },
    },
    ({ tripId, ...rest }) => runTool("add_checklist_item", () => addChecklistItem(tripId, rest)),
  );

  server.registerTool(
    "add_shopping_item",
    {
      title: "Add shopping item",
      description:
        "Adds a standalone entry to a trip's Shopping list: something to buy that isn't also a Packing item, like flight snacks or a gift. To shop for a Packing item instead, use set_need_to_buy on it.",
      inputSchema: { tripId: z.string(), text: z.string().trim().min(1) },
    },
    ({ tripId, text }) => runTool("add_shopping_item", () => addChecklistItem(tripId, { kind: "SHOPPING", text })),
  );

  server.registerTool(
    "update_checklist_item",
    {
      title: "Update checklist item",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. Pass dueDate null to clear it.",
      inputSchema: {
        itemId: z.string(),
        text: z.string().trim().min(1).optional(),
        dueDate: isoDate.nullable().optional(),
      },
    },
    ({ itemId, text, dueDate }) =>
      runTool("update_checklist_item", () =>
        updateChecklistItem(itemId, {
          ...(text !== undefined ? { text } : {}),
          ...(dueDate !== undefined ? { dueDate: dueDate ?? "" } : {}),
        }),
      ),
  );

  server.registerTool(
    "tick_checklist_item",
    {
      title: "Tick checklist item",
      description: "Marks a checklist item done or not done.",
      inputSchema: { itemId: z.string(), done: z.boolean() },
    },
    ({ itemId, done }) => runTool("tick_checklist_item", () => toggleChecklistItem(itemId, done)),
  );

  server.registerTool(
    "set_need_to_buy",
    {
      title: "Set need to buy",
      description:
        "Sets a Packing item's shopping state (CONTEXT.md 'Shopping list'): NEEDED puts it on the Shopping list unticked, BOUGHT ticks it there, null clears it. The Packing item itself is untouched either way. Only a Packing item can carry this.",
      inputSchema: { itemId: z.string(), buy: buyStateSchema.nullable() },
    },
    ({ itemId, buy }) => runTool("set_need_to_buy", () => setBuyState(itemId, buy)),
  );

  server.registerTool(
    "move_checklist_item",
    {
      title: "Move checklist item",
      description: "Moves a checklist item one place up or down within its own list, swapping it with its neighbour. A no-op at either end.",
      inputSchema: { itemId: z.string(), direction: z.enum(["up", "down"]) },
    },
    ({ itemId, direction }) => runTool("move_checklist_item", () => reorderChecklistItem(itemId, direction)),
  );

  server.registerTool(
    "delete_checklist_item",
    {
      title: "Delete checklist item",
      description: "Permanently deletes a checklist item. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { itemId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ itemId }) => runTool("delete_checklist_item", () => deleteChecklistItem(itemId)),
  );

  // ---------------------------------------------------------------------
  // Packing templates
  // ---------------------------------------------------------------------

  server.registerTool(
    "save_packing_template",
    {
      title: "Save packing template",
      description: "Saves the trip's current Packing list as a reusable template, owned by the acting Traveller.",
      inputSchema: { tripId: z.string(), name: z.string().trim().min(1) },
    },
    ({ tripId, name }) => runTool("save_packing_template", () => saveAsTemplate(tripId, name)),
  );

  server.registerTool(
    "apply_packing_template",
    {
      title: "Apply packing template",
      description:
        "Adds a saved Packing template's items to the trip's Packing list. Items already on the list (by text, case-insensitive) are skipped. The template must be owned by the acting Traveller.",
      inputSchema: { tripId: z.string(), templateId: z.string() },
    },
    ({ tripId, templateId }) => runTool("apply_packing_template", () => applyTemplate(tripId, templateId)),
  );
}
