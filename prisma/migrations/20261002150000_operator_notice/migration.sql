-- Operator notices (spec 2026-10-02 §B): a one-row-per-key ledger so the
-- "storage is at its ceiling" push goes out once a day, not once per refused
-- upload. Additive: a new table nothing in the running build reads.
CREATE TABLE "OperatorNotice" (
  "key" TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatorNotice_pkey" PRIMARY KEY ("key")
);
