-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('DRAFT', 'PENDING_AVAILABILITY_CHECK', 'PENDING_PROVIDER_ACCEPTANCE', 'PENDING_PAYMENT', 'CONFIRMED', 'ASSIGNED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW', 'DISPUTED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "public"."BookingSource" AS ENUM ('MARKETPLACE', 'DIRECT');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'MADA', 'CARD', 'APPLE_PAY', 'STC_PAY', 'TABBY', 'TAMARA');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED');

-- AlterTable
ALTER TABLE "public"."Salon" ADD COLUMN     "acceptanceTimeoutMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "maxAdvanceDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "minNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "travelBufferMinutes" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "public"."City" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."District" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServiceCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalonService" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceHalalas" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffService" (
    "membershipId" TEXT NOT NULL,
    "salonServiceId" TEXT NOT NULL,

    CONSTRAINT "StaffService_pkey" PRIMARY KEY ("membershipId","salonServiceId")
);

-- CreateTable
CREATE TABLE "public"."SalonCoverageArea" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "travelFeeHalalas" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonCoverageArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffCoverage" (
    "membershipId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,

    CONSTRAINT "StaffCoverage_pkey" PRIMARY KEY ("membershipId","districtId")
);

-- CreateTable
CREATE TABLE "public"."AvailabilityRule" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AvailabilityException" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "districtId" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "building" TEXT,
    "floor" TEXT,
    "instructions" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "staffMembershipId" TEXT NOT NULL,
    "addressId" TEXT,
    "source" "public"."BookingSource" NOT NULL DEFAULT 'MARKETPLACE',
    "status" "public"."BookingStatus" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "blockedFrom" TIMESTAMP(3) NOT NULL,
    "acceptBy" TIMESTAMP(3),
    "addrCityAr" TEXT NOT NULL,
    "addrCityEn" TEXT NOT NULL,
    "addrDistrictAr" TEXT NOT NULL,
    "addrDistrictEn" TEXT NOT NULL,
    "addrDistrictId" TEXT NOT NULL,
    "addrStreet" TEXT NOT NULL,
    "addrBuilding" TEXT,
    "addrFloor" TEXT,
    "addrInstructions" TEXT,
    "subtotalHalalas" INTEGER NOT NULL,
    "travelFeeHalalas" INTEGER NOT NULL,
    "vatBps" INTEGER NOT NULL,
    "vatHalalas" INTEGER NOT NULL,
    "totalHalalas" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionHalalas" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "cancellationWindowHours" INTEGER NOT NULL,
    "paymentMethod" "public"."PaymentMethod" NOT NULL,
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "salonServiceId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceHalalas" INTEGER NOT NULL,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingStatusHistory" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "from" "public"."BookingStatus",
    "to" "public"."BookingStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL,
    "amountHalalas" INTEGER NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerRef" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentMethodConfig" (
    "method" "public"."PaymentMethod" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("method")
);

-- CreateTable
CREATE TABLE "public"."SalonPaymentMethod" (
    "salonId" TEXT NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalonPaymentMethod_pkey" PRIMARY KEY ("salonId","method")
);

-- CreateTable
CREATE TABLE "public"."PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "staffMembershipId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "punctuality" INTEGER,
    "quality" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_nameEn_key" ON "public"."City"("nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "District_cityId_nameEn_key" ON "public"."District"("cityId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_slug_key" ON "public"."ServiceCategory"("slug");

-- CreateIndex
CREATE INDEX "SalonService_salonId_idx" ON "public"."SalonService"("salonId");

-- CreateIndex
CREATE INDEX "SalonService_categoryId_active_idx" ON "public"."SalonService"("categoryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SalonCoverageArea_salonId_districtId_key" ON "public"."SalonCoverageArea"("salonId", "districtId");

-- CreateIndex
CREATE INDEX "AvailabilityRule_membershipId_weekday_idx" ON "public"."AvailabilityRule"("membershipId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityException_membershipId_date_key" ON "public"."AvailabilityException"("membershipId", "date");

-- CreateIndex
CREATE INDEX "CustomerAddress_userId_idx" ON "public"."CustomerAddress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_number_key" ON "public"."Booking"("number");

-- CreateIndex
CREATE INDEX "Booking_customerId_startsAt_idx" ON "public"."Booking"("customerId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_salonId_startsAt_idx" ON "public"."Booking"("salonId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_staffMembershipId_startsAt_idx" ON "public"."Booking"("staffMembershipId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_status_acceptBy_idx" ON "public"."Booking"("status", "acceptBy");

-- CreateIndex
CREATE INDEX "BookingStatusHistory_bookingId_createdAt_idx" ON "public"."BookingStatusHistory"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "public"."Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "public"."Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "public"."Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_salonId_idx" ON "public"."Review"("salonId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "public"."Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."District" ADD CONSTRAINT "District_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "public"."City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonService" ADD CONSTRAINT "SalonService_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonService" ADD CONSTRAINT "SalonService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffService" ADD CONSTRAINT "StaffService_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "public"."SalonMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffService" ADD CONSTRAINT "StaffService_salonServiceId_fkey" FOREIGN KEY ("salonServiceId") REFERENCES "public"."SalonService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonCoverageArea" ADD CONSTRAINT "SalonCoverageArea_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonCoverageArea" ADD CONSTRAINT "SalonCoverageArea_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "public"."District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffCoverage" ADD CONSTRAINT "StaffCoverage_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "public"."SalonMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffCoverage" ADD CONSTRAINT "StaffCoverage_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "public"."District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "public"."SalonMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AvailabilityException" ADD CONSTRAINT "AvailabilityException_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "public"."SalonMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerAddress" ADD CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerAddress" ADD CONSTRAINT "CustomerAddress_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "public"."District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_staffMembershipId_fkey" FOREIGN KEY ("staffMembershipId") REFERENCES "public"."SalonMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "public"."CustomerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_salonServiceId_fkey" FOREIGN KEY ("salonServiceId") REFERENCES "public"."SalonService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingStatusHistory" ADD CONSTRAINT "BookingStatusHistory_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingStatusHistory" ADD CONSTRAINT "BookingStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonPaymentMethod" ADD CONSTRAINT "SalonPaymentMethod_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_staffMembershipId_fkey" FOREIGN KEY ("staffMembershipId") REFERENCES "public"."SalonMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Integrity guarantees enforced by PostgreSQL itself (not only by application code) ───

-- A provider can never hold two overlapping active reservations, even under concurrent requests.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "public"."Booking"
  ADD CONSTRAINT "booking_no_overlap_per_provider"
  EXCLUDE USING gist (
    "staffMembershipId" WITH =,
    tsrange("blockedFrom", "endsAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING_PROVIDER_ACCEPTANCE','PENDING_PAYMENT','CONFIRMED','ASSIGNED','PROVIDER_EN_ROUTE','PROVIDER_ARRIVED','IN_PROGRESS'));

ALTER TABLE "public"."Booking" ADD CONSTRAINT "booking_time_order" CHECK ("blockedFrom" <= "startsAt" AND "startsAt" < "endsAt");
ALTER TABLE "public"."Booking" ADD CONSTRAINT "booking_amounts_nonneg" CHECK ("subtotalHalalas" >= 0 AND "travelFeeHalalas" >= 0 AND "vatHalalas" >= 0 AND "totalHalalas" >= 0 AND "commissionHalalas" >= 0);
ALTER TABLE "public"."SalonService" ADD CONSTRAINT "service_values" CHECK ("durationMinutes" BETWEEN 5 AND 720 AND "priceHalalas" >= 0);
ALTER TABLE "public"."SalonCoverageArea" ADD CONSTRAINT "coverage_fee_nonneg" CHECK ("travelFeeHalalas" >= 0);
ALTER TABLE "public"."AvailabilityRule" ADD CONSTRAINT "availability_values" CHECK ("weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");
ALTER TABLE "public"."Review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5 AND ("punctuality" IS NULL OR "punctuality" BETWEEN 1 AND 5) AND ("quality" IS NULL OR "quality" BETWEEN 1 AND 5));
ALTER TABLE "public"."Payment" ADD CONSTRAINT "payment_amount_nonneg" CHECK ("amountHalalas" >= 0);
ALTER TABLE "public"."Salon" ADD CONSTRAINT "salon_policy_values" CHECK ("travelBufferMinutes" BETWEEN 0 AND 240 AND "minNoticeMinutes" >= 0 AND "maxAdvanceDays" BETWEEN 1 AND 365 AND "cancellationWindowHours" >= 0 AND "acceptanceTimeoutMinutes" BETWEEN 5 AND 1440);
