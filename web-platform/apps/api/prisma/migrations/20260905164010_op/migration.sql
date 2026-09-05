-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'INDIVIDUAL_USER';

-- CreateTable
CREATE TABLE "IndividualUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualUserDevice" (
    "individualUserId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualUserDevice_pkey" PRIMARY KEY ("individualUserId","deviceId")
);

-- CreateTable
CREATE TABLE "IndividualMeasurement" (
    "id" TEXT NOT NULL,
    "individualUserId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "MeasurementType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "quality" "MeasurementQuality" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualEcgSession" (
    "id" TEXT NOT NULL,
    "individualUserId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "sampleRate" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualEcgSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualEcgChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "samples" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualEcgChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndividualUser_userId_key" ON "IndividualUser"("userId");

-- CreateIndex
CREATE INDEX "IndividualMeasurement_individualUserId_measuredAt_idx" ON "IndividualMeasurement"("individualUserId", "measuredAt");

-- CreateIndex
CREATE INDEX "IndividualMeasurement_individualUserId_type_measuredAt_idx" ON "IndividualMeasurement"("individualUserId", "type", "measuredAt");

-- CreateIndex
CREATE INDEX "IndividualEcgSession_individualUserId_startedAt_idx" ON "IndividualEcgSession"("individualUserId", "startedAt");

-- CreateIndex
CREATE INDEX "IndividualEcgChunk_sessionId_sequence_idx" ON "IndividualEcgChunk"("sessionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualEcgChunk_sessionId_sequence_key" ON "IndividualEcgChunk"("sessionId", "sequence");

-- AddForeignKey
ALTER TABLE "IndividualUser" ADD CONSTRAINT "IndividualUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualUserDevice" ADD CONSTRAINT "IndividualUserDevice_individualUserId_fkey" FOREIGN KEY ("individualUserId") REFERENCES "IndividualUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualUserDevice" ADD CONSTRAINT "IndividualUserDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualMeasurement" ADD CONSTRAINT "IndividualMeasurement_individualUserId_fkey" FOREIGN KEY ("individualUserId") REFERENCES "IndividualUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualMeasurement" ADD CONSTRAINT "IndividualMeasurement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualEcgSession" ADD CONSTRAINT "IndividualEcgSession_individualUserId_fkey" FOREIGN KEY ("individualUserId") REFERENCES "IndividualUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualEcgSession" ADD CONSTRAINT "IndividualEcgSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualEcgChunk" ADD CONSTRAINT "IndividualEcgChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "IndividualEcgSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
