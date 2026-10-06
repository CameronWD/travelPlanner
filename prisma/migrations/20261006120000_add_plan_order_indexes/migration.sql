-- Composite indexes for the plan-order reads (spec 2026-10-06 §V, audit P23).
-- Every Plan/Day/Home read filters `tripId + forkId IS NULL ORDER BY
-- sortOrder` on Stop, Transport and Item, which had only single-column
-- indexes; Reminders are read by trip and date; the Admin queue counts
-- AccessRequests by `resolvedAt IS NULL`. Additive on reads and writes
-- (docs/DEPLOY.md §4b): no column, constraint or existing index changes.
CREATE INDEX "Stop_tripId_forkId_sortOrder_idx" ON "Stop"("tripId", "forkId", "sortOrder");
CREATE INDEX "Transport_tripId_forkId_sortOrder_idx" ON "Transport"("tripId", "forkId", "sortOrder");
CREATE INDEX "Item_tripId_forkId_sortOrder_idx" ON "Item"("tripId", "forkId", "sortOrder");
CREATE INDEX "Reminder_tripId_date_idx" ON "Reminder"("tripId", "date");
CREATE INDEX "AccessRequest_resolvedAt_idx" ON "AccessRequest"("resolvedAt");
