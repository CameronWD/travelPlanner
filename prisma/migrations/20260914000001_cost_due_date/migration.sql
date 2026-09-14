-- Due date on unpaid Costs: money committed but not yet taken (a scheduled
-- Airbnb charge). Drives Upcoming payments + push alerts (CONTEXT.md "Due date").
ALTER TABLE "Cost" ADD COLUMN "dueDate" TEXT;
CREATE INDEX "Cost_dueDate_idx" ON "Cost"("dueDate");
