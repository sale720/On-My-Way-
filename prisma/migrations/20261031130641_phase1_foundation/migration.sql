-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."Locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "public"."PlatformRole" AS ENUM ('CUSTOMER', 'PROVIDER', 'SUPPORT_AGENT', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "public"."SalonStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."SalonRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "locale" "public"."Locale" NOT NULL DEFAULT 'ar',
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlatformRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."PlatformRole" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Salon" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."SalonStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Salon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalonMembership" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."SalonRole" NOT NULL,
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "salonId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRoleAssignment_userId_role_key" ON "public"."PlatformRoleAssignment"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_createdAt_idx" ON "public"."OtpChallenge"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_requestIp_createdAt_idx" ON "public"."OtpChallenge"("requestIp", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Salon_slug_key" ON "public"."Salon"("slug");

-- CreateIndex
CREATE INDEX "SalonMembership_userId_idx" ON "public"."SalonMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalonMembership_salonId_userId_key" ON "public"."SalonMembership"("salonId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "public"."AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_salonId_createdAt_idx" ON "public"."AuditLog"("salonId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."PlatformRoleAssignment" ADD CONSTRAINT "PlatformRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlatformRoleAssignment" ADD CONSTRAINT "PlatformRoleAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Salon" ADD CONSTRAINT "Salon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonMembership" ADD CONSTRAINT "SalonMembership_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalonMembership" ADD CONSTRAINT "SalonMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "public"."Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
