-- CreateTable
CREATE TABLE "FeedbackPicture" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackPicture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackPicture_noteId_idx" ON "FeedbackPicture"("noteId");

-- AddForeignKey
ALTER TABLE "FeedbackPicture" ADD CONSTRAINT "FeedbackPicture_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "FeedbackNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

