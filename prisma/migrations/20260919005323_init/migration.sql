-- CreateEnum
CREATE TYPE "ReservationKind" AS ENUM ('VESSEL', 'EVENT');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('IMPORT', 'APP');

-- CreateEnum
CREATE TYPE "ImportIssueType" AS ENUM ('DOUBLE_BOOKING', 'DOES_NOT_FIT', 'UNKNOWN_LENGTH', 'DURATION_UNCERTAIN', 'LENGTH_DISCREPANCY', 'UNPARSED_CELL');

-- CreateEnum
CREATE TYPE "ImportIssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "Berth" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lengthFt" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Berth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "typePrefix" TEXT,
    "lengthFt" INTEGER,
    "operator" TEXT,
    "contactNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "berthId" TEXT NOT NULL,
    "kind" "ReservationKind" NOT NULL,
    "vesselId" TEXT,
    "eventName" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "notes" TEXT,
    "source" "ReservationSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "type" "ImportIssueType" NOT NULL,
    "severity" "ImportIssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "sheet" TEXT,
    "cellRef" TEXT,
    "year" INTEGER,
    "reservationId" TEXT,
    "reservationBId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Berth_name_key" ON "Berth"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_normalizedName_key" ON "Vessel"("normalizedName");

-- CreateIndex
CREATE INDEX "Reservation_berthId_startDate_endDate_idx" ON "Reservation"("berthId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Reservation_vesselId_idx" ON "Reservation"("vesselId");

-- CreateIndex
CREATE INDEX "Reservation_source_idx" ON "Reservation"("source");

-- CreateIndex
CREATE INDEX "ImportIssue_type_idx" ON "ImportIssue"("type");

-- CreateIndex
CREATE INDEX "ImportIssue_year_idx" ON "ImportIssue"("year");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_berthId_fkey" FOREIGN KEY ("berthId") REFERENCES "Berth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_reservationBId_fkey" FOREIGN KEY ("reservationBId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- APP bookings: no overlapping date ranges on the same berth (inclusive daterange).
-- Imported history is exempt so real conflicts can be surfaced as ImportIssues.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_app_no_overlap"
  EXCLUDE USING gist (
    "berthId" WITH =,
    daterange("startDate", "endDate", '[]') WITH &&
  )
  WHERE (source = 'APP');
