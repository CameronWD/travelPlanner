-- CreateTable
CREATE TABLE "Globe" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Globe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobeMember" (
    "id" TEXT NOT NULL,
    "globeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobeInvite" (
    "id" TEXT NOT NULL,
    "globeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobeInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marker" (
    "id" TEXT NOT NULL,
    "globeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "link" TEXT,
    "timing" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "city" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Marker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Globe_createdById_idx" ON "Globe"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "GlobeMember_userId_key" ON "GlobeMember"("userId");

-- CreateIndex
CREATE INDEX "GlobeMember_globeId_idx" ON "GlobeMember"("globeId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobeInvite_token_key" ON "GlobeInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "GlobeInvite_globeId_email_key" ON "GlobeInvite"("globeId", "email");

-- CreateIndex
CREATE INDEX "GlobeInvite_globeId_idx" ON "GlobeInvite"("globeId");

-- CreateIndex
CREATE INDEX "GlobeInvite_email_idx" ON "GlobeInvite"("email");

-- CreateIndex
CREATE INDEX "Marker_globeId_idx" ON "Marker"("globeId");

-- CreateIndex
CREATE INDEX "Marker_createdById_idx" ON "Marker"("createdById");

-- AddForeignKey
ALTER TABLE "Globe" ADD CONSTRAINT "Globe_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobeMember" ADD CONSTRAINT "GlobeMember_globeId_fkey" FOREIGN KEY ("globeId") REFERENCES "Globe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobeMember" ADD CONSTRAINT "GlobeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobeInvite" ADD CONSTRAINT "GlobeInvite_globeId_fkey" FOREIGN KEY ("globeId") REFERENCES "Globe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marker" ADD CONSTRAINT "Marker_globeId_fkey" FOREIGN KEY ("globeId") REFERENCES "Globe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marker" ADD CONSTRAINT "Marker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
