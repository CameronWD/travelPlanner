import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fileAttachment } from "@/server/actions/attachments";
import type { MoveTarget } from "@/lib/attachment-move";
import { runWrite } from "../run-tool";
import { requireRealPlanRows, type RealPlanKind } from "../real-plan";
import { loadAttachmentIndexForMcp } from "../reads/attachments";

const PLAN_KIND: Record<"STOP" | "ITEM" | "TRANSPORT" | "ACCOMMODATION", RealPlanKind> = {
  STOP: "stop",
  ITEM: "item",
  TRANSPORT: "transport",
  ACCOMMODATION: "accommodation",
};

const target = z
  .object({ kind: z.enum(["TRIP", "STOP", "ITEM", "TRANSPORT", "ACCOMMODATION"]), id: z.string().optional() })
  .refine((t) => t.kind === "TRIP" || !!t.id, { message: "id is required unless kind is TRIP", path: ["id"] });

export function registerAttachFileTool(server: McpServer): void {
  server.registerTool(
    "attach_file",
    {
      title: "Attach a file",
      description:
        "Files an Attachment that is already on the Trip onto one or more things: it moves to the first and each further one gets its own copy. Optionally gives it a title. Find files with the files read first. Cannot upload or delete a file, and cannot touch an Item photo.",
      inputSchema: { attachmentId: z.string(), targets: z.array(target).min(1).max(6), title: z.string().optional() },
    },
    ({ attachmentId, targets, title }) =>
      runWrite(
        "attach_file",
        async () => {
          const moves: MoveTarget[] = targets.map((t) =>
            t.kind === "TRIP" ? { type: "TRIP" } : { type: t.kind, id: t.id! },
          );
          await requireRealPlanRows(
            targets.flatMap((t): [RealPlanKind, string][] => (t.kind === "TRIP" ? [] : [[PLAN_KIND[t.kind], t.id!]])),
          );
          return fileAttachment(attachmentId, moves, title);
        },
        async ({ tripId, attachmentIds }) => {
          const { attachments } = await loadAttachmentIndexForMcp(tripId);
          return { attachments: attachments.filter((a) => attachmentIds.includes(a.id)) };
        },
      ),
  );
}
