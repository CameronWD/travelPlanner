/**
 * Reviews for the Claude connection (spec 2026-10-17 R8-R13). get_review and
 * list_reviews are open to everyone on the Trip (R12: reading is open). They
 * read through lib/mcp/reads/reviews.ts. review_trip is registered by
 * registerReviewRunTool, which buildMcpServer calls only for a caller whose
 * Review permission isn't Off (lib/mcp/server.ts listsReviewTrip).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startReview } from "@/server/actions/reviews";
import { runTool, runWrite } from "../run-tool";
import { loadReviewForMcp, loadReviewsForMcp } from "../reads/reviews";
import {
  FINDING_CATEGORY_MEANING, FINDING_ORIGIN_MEANING, FINDING_SEVERITY_MEANING, FINDING_STATE_MEANING, describeValues,
  REVIEW_DEPTHS, REVIEW_DEPTH_MEANING, REVIEW_KIND_OF_DEPTH,
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
        "Lists the trip's latest Reviews, at most 50, newest first: who started each, when, its depth (standard or deep), its status (RUNNING, DONE or FAILED), its summary line and how many Findings are still open. " +
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
        "target names what a Finding is about (type ITEM, TRANSPORT, ACCOMMODATION, STOP, DAY or TRIP, and its id). Read it with get_item, get_transport, get_accommodation or get_stop. A DAY target has a null id: its day is the Finding's date (YYYY-MM-DD), which is what get_day takes. A TRIP target has a null id too. " +
        "suggestedFix is the change the app's Apply button would make, and fixWith names the tool you would make it with. Making the change yourself does not mark the Finding Applied, and only someone in the app can Apply or Dismiss it. " +
        "A Review saw the trip as everyone on it sees it, so a Surprise's contents are never in it, and a Finding about something kept from the person you act as is left out. Tell the person what it found and change nothing until they agree.",
      inputSchema: { reviewId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ reviewId }) => runTool("get_review", () => loadReviewForMcp(reviewId)),
  );
}

type StartResult = Awaited<ReturnType<typeof startReview>>;

/**
 * A limit refusal carries when the next Review is available (startReview's
 * nextAvailableAt). runTool relays only the message, so the time joins it,
 * and Claude can tell the person when. Every other result passes unchanged.
 */
function withNextAvailable(result: StartResult): StartResult {
  if (result.success || !result.nextAvailableAt) return result;
  const errors = Object.fromEntries(
    Object.entries(result.errors).map(([k, msgs]) => [k, k === "_" ? msgs.map((msg) => `${msg} The next one is available from ${result.nextAvailableAt} (UTC).`) : msgs]),
  );
  return { ...result, errors };
}

/**
 * review_trip (R13): starts a Review through the app's own startReview, so
 * the permission, the Limited allowance (R12), the one-per-Trip lock and the
 * background run (after(), lib/review/run.ts, which reads no session and
 * records no Activity) are exactly the Reviews tab's. Returns the Review as
 * it now stands (F6), RUNNING with no Findings yet. Only buildMcpServer's
 * gate registers it.
 */
export function registerReviewRunTool(server: McpServer): void {
  server.registerTool(
    "review_trip",
    {
      title: "Start a review",
      description:
        "Starts a Review of the whole trip: Teepee checks the real plan as everyone on the trip sees it (Surprises masked), with web search for closures, seasons, public holidays, tickets, logistics, stale notes and packing, and restates the current Flags. " +
        "It runs in the background and takes a few minutes. This returns the Review with status RUNNING and no Findings yet. Check it with get_review. " +
        "Each one counts against the person's Review allowance, and a trip runs one at a time. If it is refused, say why, in the words it gives. A refusal at the allowance gives when the next one is available as a UTC time: say it in the person's own time.",
      inputSchema: {
        tripId: z.string(),
        depth: z.enum(REVIEW_DEPTHS).optional().describe(describeValues("How thorough. Left out, standard.", REVIEW_DEPTH_MEANING, REVIEW_DEPTHS)),
      },
    },
    ({ tripId, depth }) =>
      runWrite(
        "review_trip",
        async () => withNextAvailable(await startReview(tripId, REVIEW_KIND_OF_DEPTH[depth ?? "standard"])),
        async (done) => ({ review: await loadReviewForMcp(done.reviewId) }),
      ),
  );
}
