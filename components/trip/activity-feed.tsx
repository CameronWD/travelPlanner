import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { headline } from "@/lib/activity";
import { relativeTime } from "@/lib/relative-time";
import type { ActivityVerb, ActivityEntityType, ActivityChange } from "@/lib/activity";

export interface ActivityRow {
  id: string;
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityLabel: string;
  changes: unknown;
  createdAt: Date;
  actor: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface ActivityFeedProps {
  activities: ActivityRow[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        tone="teal"
        title="No activity yet"
        description="Changes to your Trip — Stops, transport, costs, and notes — will appear here."
      />
    );
  }

  return (
    <Card data-slot="activity-card" className="max-w-[760px] p-3.5 sm:p-[22px]">
      <ul className="flex flex-col">
        {activities.map((activity) => {
          const actorName = activity.actor.name ?? "Someone";
          const initials = actorName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const headlineText = headline({
            verb: activity.verb,
            entityType: activity.entityType,
            entityLabel: activity.entityLabel,
          });

          // Parse field changes for UPDATED rows
          let changes: ActivityChange[] = [];
          if (activity.verb === "UPDATED" && Array.isArray(activity.changes)) {
            changes = (activity.changes as unknown[]).filter(
              (c): c is ActivityChange =>
                typeof c === "object" &&
                c !== null &&
                "label" in c &&
                "from" in c &&
                "to" in c,
            );
          }

          // Extract excerpt for NOTED rows
          const noteExcerpt =
            activity.verb === "NOTED" &&
            typeof activity.changes === "object" &&
            activity.changes !== null &&
            !Array.isArray(activity.changes) &&
            "excerpt" in (activity.changes as object)
              ? (activity.changes as { excerpt: string }).excerpt
              : null;

          // Extract a one-line summary payload (reorder / batch actions)
          const summary =
            typeof activity.changes === "object" &&
            activity.changes !== null &&
            !Array.isArray(activity.changes) &&
            "summary" in (activity.changes as object)
              ? (activity.changes as { summary: string }).summary
              : null;

          const when = relativeTime(activity.createdAt);

          const sub =
            changes.length > 0 || noteExcerpt ? (
              <>
                {changes.map((change) => (
                  <span key={change.field} className="block">
                    <span className="font-bold text-foreground">{change.label}:</span>{" "}
                    {change.from || <em>empty</em>}{" "}
                    <span aria-hidden="true">→</span>
                    <span className="sr-only">to</span>{" "}
                    {change.to || <em>empty</em>}
                  </span>
                ))}
                {noteExcerpt ? (
                  <span className="block">&ldquo;{noteExcerpt}&rdquo;</span>
                ) : null}
              </>
            ) : null;

          return (
            <li
              key={activity.id}
              className="border-t border-border-soft py-[5px] first:border-t-0"
            >
              <ListRow
                className="gap-3 text-sm font-medium text-foreground"
                leading={
                  <Avatar className="size-[30px]">
                    {activity.actor.image ? (
                      <AvatarImage src={activity.actor.image} alt={actorName} />
                    ) : null}
                    <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
                  </Avatar>
                }
                title={
                  <>
                    <b className="font-extrabold">{actorName}</b> {summary ?? headlineText}
                    <span className="sr-only">, {when}</span>
                  </>
                }
                sub={sub}
                trailing={
                  <time
                    dateTime={activity.createdAt.toISOString()}
                    title={activity.createdAt.toLocaleString()}
                    className="text-xs font-semibold"
                  >
                    {when}
                  </time>
                }
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
