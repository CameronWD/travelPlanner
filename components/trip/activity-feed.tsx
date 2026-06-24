import { cn } from "@/lib/cn";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
      <p className="text-sm text-muted-foreground">No activity yet.</p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
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

        return (
          <li
            key={activity.id}
            className={cn(
              "flex items-start gap-3 py-4",
            )}
          >
            <Avatar className="size-8 shrink-0">
              {activity.actor.image ? (
                <AvatarImage src={activity.actor.image} alt={actorName} />
              ) : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm text-foreground">
                <span className="font-medium">{actorName}</span>{" "}
                {headlineText}
              </p>

              {changes.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {changes.map((change) => (
                    <li
                      key={change.field}
                      className="text-xs text-muted-foreground"
                    >
                      <span className="font-medium text-foreground/70">
                        {change.label}:
                      </span>{" "}
                      {change.from || <em>empty</em>}{" "}
                      <span aria-hidden="true">→</span>{" "}
                      {change.to || <em>empty</em>}
                    </li>
                  ))}
                </ul>
              ) : null}

              <time
                dateTime={activity.createdAt.toISOString()}
                className="text-xs text-muted-foreground"
              >
                {relativeTime(activity.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
