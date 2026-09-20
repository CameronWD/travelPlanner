-- CreateTable
CREATE TABLE "CronHeartbeat" (
    "id" TEXT NOT NULL DEFAULT 'digest',
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronHeartbeat_pkey" PRIMARY KEY ("id")
);
