"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StopCard, type StopCardStop } from "./stop-card";
import { StopFormDialog } from "./stop-form-dialog";
import { deleteStop, moveStop } from "@/server/actions/stops";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface StopsManagerProps {
  tripId: string;
  initialStops: StopCardStop[];
}

/**
 * Client component that manages the interactive stops list:
 * add, edit, delete, reorder.
 *
 * Data comes in as server-rendered props; mutations call server actions and
 * rely on revalidatePath to refresh the page data.
 */
export function StopsManager({ tripId, initialStops }: StopsManagerProps) {
  const { confirm, dialog } = useConfirm();
  const [editingStop, setEditingStop] = React.useState<StopCardStop | null>(
    null,
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleDelete(stopId: string) {
    const stop = initialStops.find((s) => s.id === stopId);
    const confirmed = await confirm({
      title: `Delete "${stop?.name ?? "this stop"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setPendingId(stopId);
    try {
      await deleteStop(stopId);
    } finally {
      setPendingId(null);
    }
  }

  async function handleMove(stopId: string, direction: "up" | "down") {
    setPendingId(stopId);
    try {
      await moveStop(stopId, direction);
    } finally {
      setPendingId(null);
    }
  }

  const hasStops = initialStops.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {hasStops && (
        <>
          {/* Stop cards list — staggered entrance, animated add/remove/reorder */}
          <AnimatedList className="flex flex-col gap-3" staggerOnMount>
            {initialStops.map((stop, idx) => (
              <AnimatedItem key={stop.id} index={idx}>
                <StopCard
                  stop={stop}
                  isFirst={idx === 0}
                  isLast={idx === initialStops.length - 1}
                  isPending={pendingId === stop.id}
                  onEdit={(s) => setEditingStop(s)}
                  onMoveUp={(id) => handleMove(id, "up")}
                  onMoveDown={(id) => handleMove(id, "down")}
                  onDelete={handleDelete}
                />
              </AnimatedItem>
            ))}
          </AnimatedList>

          {/* Add stop button at the bottom of the list */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="md"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add stop
            </Button>
          </div>
        </>
      )}

      {/* When no stops yet, show just the Add button */}
      {!hasStops && (
        <div className="flex justify-center">
          <Button
            variant="primary"
            size="md"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add stop
          </Button>
        </div>
      )}

      {/* Add dialog */}
      <StopFormDialog
        tripId={tripId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Edit dialog */}
      {editingStop && (
        <StopFormDialog
          tripId={tripId}
          stop={editingStop}
          open={Boolean(editingStop)}
          onOpenChange={(open) => {
            if (!open) setEditingStop(null);
          }}
        />
      )}

      {dialog}
    </div>
  );
}
