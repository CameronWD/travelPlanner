/**
 * Reviews for the Claude connection (spec 2026-10-17 R8-R13). get_review and
 * list_reviews are open to everyone on the Trip (R12: reading is open). They
 * read through lib/mcp/reads/reviews.ts. review_trip is registered by
 * registerReviewRunTool, which buildMcpServer calls only for a caller whose
 * Review permission isn't Off (lib/mcp/server.ts listsReviewTrip).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool } from "../run-tool";
import { loadReviewForMcp, loadReviewsForMcp } from "../reads/reviews";
import {
  FINDING_CATEGORY_MEANING, FINDING_ORIGIN_MEANING, FINDING_SEVERITY_MEANING, FINDING_STATE_MEANING, describeValues,
} from "../vocab";
import type { FindingCategory, FindingOrigin, FindingSeverity, FindingState } from "@/lib/review/types";

const keys = <K extends string>(r: Record<K, string>) => Object.keys(r) as K[];

const FINDINGS_EXPLAINED = [
  describeValues("Each Finding has a severity.", FINDING_SEVERITY_MEANING, keys<FindingSeverity>(FINDING_SEVERITY_MEANING)),
  describeValues("A category.", FINDING_CATEGORY_MEANING, keys<FindingCategory>(FINDING_CATEGORY_MEANING)),
  describeValues("A state.", FINDING_STATE_MEANING, keys<FindingState>(FINDING_STATE_MEANING)),
  describeValues("An origin.", FINDING_ORIGIN_MEANING, keys<FindingOrigin>(FINDING_ORIGIN_MEANING)),
].join(" ");

export function registerReviewReadTools(server: McpServer): void {
  server.registerTool(
    "list_reviews",
    {
      title: "List reviews",
      description:
        "Lists the trip's Reviews, newest first: who started each, when, its depth (standard or deep), its status (RUNNING, DONE or FAILED), its summary line and how many Findings are still open. " +
        "A Review is a saved check of the whole trip that Teepee ran. It is not the review-plan prompt. Read one with get_review.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("list_reviews", () => loadReviewsForMcp(tripId)),
  );

  server.registerTool(
    "get_review",
    {
      title: "Get review",
      description:
        "Reads one Review and its Findings, warnings first. While its status is RUNNING it has no Findings yet, so check again in a minute or two. " +
        `${FINDINGS_EXPLAINED} ` +
        "target names what a Finding is about (type ITEM, TRANSPORT, ACCOMMODATION, STOP, DAY or TRIP, and its id). Read it with get_item, get_transport, get_accommodation, get_stop or get_day. " +
        "suggestedFix is the change the app's Apply button would make, and fixWith names the tool you would make it with. Making the change yourself does not mark the Finding Applied, and only someone in the app can Apply or Dismiss it. " +
        "A Review saw the trip as everyone on it sees it, so a Surprise's contents are never in it, and a Finding about something kept from the person you act as is left out. Tell the person what it found and change nothing until they agree.",
      inputSchema: { reviewId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ reviewId }) => runTool("get_review", () => loadReviewForMcp(reviewId)),
  );
}
